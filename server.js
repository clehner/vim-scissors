/*jshint indent:2 */
var WebSS  = require('ws').Server;
var http   = require('http');
var nb     = require('vim-netbeans');
var fs     = require('fs');
var debounce = require('./lib/debounce');
var sheetTypes = require('./lib/sheet');

var listenPort = process.env.PORT || 3219;
var listenHost = process.env.HOST || '0.0.0.0';

var nbServer = new nb.VimServer({'debug': 0});
var sheets = {};

var staticFiles = {
  '/': 'app.html',
  '/style.css': 0,
  '/scissors.js': 0
};

var textMimes = {
  js: 'javascript'
};

var httpServer = http.createServer(function(req, res) {
  var url = req.url;
  if (url in staticFiles) {
    var fileName = staticFiles[url] || ('.' + url);
    var extension = fileName.substr(fileName.lastIndexOf('.')+1);
    var format = textMimes[extension] || extension;
    res.setHeader('Content-Type', 'text/' + format);
    fs.createReadStream(fileName).pipe(res);
  } else {
    res.end();
  }
});

nbServer.on('clientAuthed', openSheetsInVimClient);
nbServer.listen(listenPort, listenHost);
nbServer.handleHTTP(httpServer);

var wss = new WebSS({server: httpServer});
var sockets = [];

function wsBroadcast(event, cb) {
  var msg = JSON.stringify(event);
  sockets.forEach(function(socket) {
    socket.send(msg, cb);
  });
}

function handleError(err) {
  if (err) throw err;
}

function setBufferText(buffer, text, cb) {
  buffer.getLength(function (length) {
    buffer.remove(0, length, function (err) {
      if (err) return cb(err);
      buffer.insert(0, text, cb);
    });
  });
}

function openSheetInVimClient(sheet, client) {
  var buffer, bufferText = '';

  function onSheetParsed(error) {
    var newSheet = this;
    if (error) {
      // Parsing error
      //console.log('Parsing error', error);
      return;
    }
    var diff = sheet.getRulesDiff(newSheet);
    if (!diff.length) return;
    // allow each client to have their own server-side version of the sheet
    // to make diffs from
    sheets[sheet.name] = sheet = newSheet;

    wsBroadcast({
      type: 'rulesDiff',
      sheetName: sheet.name,
      rulesDiff: diff
    }, handleError);
  }

  var handleChanges = debounce(function() {
    var newSheet = sheet.clone(bufferText);
    newSheet.once('parsed', onSheetParsed);
  });

  client.editFile(sheet.name, function(buf) {
    buffer = buf;
    var css = sheet.getText();
    setBufferText(buffer, css, function(err) {
      if (err) console.error('Error setting text', err);
      bufferText = css;
    });

    buffer.on("insert", function(offset, text) {
      bufferText = bufferText.substr(0, offset) + text +
        bufferText.substr(offset);
      handleChanges();
    });
    buffer.on("remove", function(offset, length) {
      bufferText = bufferText.substr(0, offset) +
        bufferText.substr(offset + length);
      handleChanges();
    });
    buffer.on("fileOpened", function() {
      buffer.getText(function(text) {
        bufferText = text;
        handleChanges();
      });
    });
  });
}

function openSheetInVimClients(sheet) {
  nbServer.clients.forEach(function(client) {
    openSheetInVimClient(sheet, client);
  });
}

function openSheetsInVimClient(client, password) {
  console.log("> Vim client connection");
  for (var name in sheets) {
    var sheet = sheets[name];
    openSheetInVimClient(sheet, client);
  }
  client.on("disconnected", function() {
    console.log("> Vim client disconnected");
  });
}

wss.on('connection', function(ws) {
  console.log("> Websocket connection");
  sockets.push(ws);

  ws.on('close', function() {
    console.log("> Websocket disconnected");
    sockets.splice(sockets.indexOf(ws), 1);
  });

  ws.on('message', function(msg) {
    var event;
    try {
      event = JSON.parse(msg);
    } catch(e) {
      return;
    }
    if (event.type == 'openSheet') {
      var name = event.name;
      var rules = event.cssRules;
      var Sheet = event.cssType == 'less' ?
        sheetTypes.LESSSheet : sheetTypes.CSSSheet;
      var theirSheet = new Sheet(name, rules);
      var ourSheet = sheets[name];
      var source = event.source;
      if (!ourSheet) {
        // if the sheet is new to the server, keep its source
        // and normalize the client's sheet to our parsed version of the source
        if (source) {
          ourSheet = sheets[name] = new Sheet(name, source);
        } else {
          // no source means we make a text version of the rules they sent
          sheets[name] = theirSheet;
        }
        var sheet = sheets[name];
        sheet.on('parsed', openSheetInVimClients.bind(this, sheet));
      }
      if (ourSheet) {
        theirSheet.once('parsed', function() {
          // get the client to the server's version of the sheet
          var rulesDiff = theirSheet.getRulesDiff(ourSheet);
          if (rulesDiff.length > 0) {
            ws.send(JSON.stringify({
              type: 'rulesDiff',
              sheetName: name,
              rulesDiff: rulesDiff
            }), handleError);
          }
        });
      }
    }
  });
});
