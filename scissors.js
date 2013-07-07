var sheets = {};

function cssRuleToText(rule) {
	return rule.cssText;
}

function ruleDiffToText(rule) {
	var declarations = [];
	for (var prop in rule.style) {
		declarations.push(prop + ': ' + rule.style[prop] + ';');
	}
	return rule.selectorText + ' {' + declarations.join(' ') + ' }';
}

// wrap and sync a CSSStyleSheet
function Sheet(name, sheet) {
	this.sheet = sheet;
	this.name = name;
	this.cssRules = [].slice.call(sheet.cssRules);
	/*
	if (sheet.ownerNode.nodeName == 'STYLE') {
		// todo: generate name based on page filename
		this.name = 'style' + i + '.css';
	} else {
		this.name = sheet.href.substr(sheet.href.lastIndexOf('/') + 1);
	}
	*/
}

Sheet.prototype.openOnServer = function(contents, type) {
	conn.send(JSON.stringify(a={
		type: "openSheet",
		name: this.name,
		source: contents,
		cssType: type,
		cssRules: this.cssRules.map(cssRuleToText)
	}));
};

Sheet.prototype.applyDiff = function(rulesDiff) {
	var rules = this.cssRules;
	var offset = 0;
	var sheet = this.sheet;
	rulesDiff.forEach(function (ruleDiff, i) {
		var index = ruleDiff.index + offset;
		var rule = rules[index];
		if (ruleDiff.remove) {
			sheet.deleteRule(index);
			rules.splice(index, 1);
			offset--;
			return;
		}
		if (!rule) {
			sheet.insertRule(ruleDiffToText(ruleDiff), index);
			rule = sheet.cssRules[index];
			rules.splice(index, 0, rule);
			offset++;
		}
		if (ruleDiff.selectorText) {
			rule.selectorText = ruleDiff.selectorText;
		}
		for (var prop in ruleDiff.style) {
			rule.style[prop] = ruleDiff.style[prop] || '';
		}
	});
};

function xhr(url, cb) {
	var req = new XMLHttpRequest();
	req.open('GET', url, true);
	req.onreadystatechange = function () {
		if (req.readyState == 4) {
			cb(req.responseText);
			delete req.onreadystatechange;
			delete req;
		}
	};
	req.send(null);
}

function openStylesheet(name, type, sheet, contents) {
	var resource = new Sheet(name, sheet);
	sheets[name] = resource;
	resource.openOnServer(contents, type);
}

function captureStylesheet(link) {
	var path = link.href.replace(location.origin, '');
	var relPath = path.replace(location.pathname, '');
	if (link.rel == 'stylesheet') {
		if (!link.sheet || !link.sheet.cssRules) {
			//console.log('Unreachable stylesheet', path);
			return;
		}
		xhr(link.href, openStylesheet.bind(this, relPath, 'css', link.sheet));

	} else if (link.rel == 'stylesheet/less') {
		var id = path.replace(/\//g, '-').replace(/^-*(.*)\.(.*?)$/, '$2:$1');
		var style = document.getElementById(id);
		var sheet = style && style.sheet;
		if (!sheet || !sheet.cssRules) {
			console.log('Creating Less stylesheet for', id);
			style = document.createElement('style');
			document.getElementsByTagName('head')[0].appendChild(style);
		}
		xhr(link.href, openStylesheet.bind(this, relPath, 'less', style.sheet));
	}
}

function captureStylesheets() {
	[].slice.call(document.getElementsByTagName('link')).forEach(captureStylesheet);
}

var myScript = (function(scripts) {
	return scripts[scripts.length-1];
})(document.getElementsByTagName('script'));

var url = 'ws' + myScript.src.match(/s?:s?.*\//);
var conn = new WebSocket(url);

conn.onerror = function(err) {
	throw err;
};

conn.onopen = captureStylesheets;

conn.onmessage = function(msg) {
	var event = JSON.parse(msg.data);

	if (event.type == 'rulesDiff') {
		var sheet = sheets[event.sheetName];
		if (!sheet) {
			console.error('Unknown sheet', event.sheetName);
			return;
		}
		sheet.applyDiff(event.rulesDiff);
	}
};

conn.onclose = function() {
};
