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
function Sheet(sheet, i) {
	if (!(this instanceof Sheet)) return new Sheet(sheet, i);
	if (!sheet.cssRules) {
		this.bad = true;
		return;
	}
	this.sheet = sheet;
	if (sheet.ownerNode.nodeName == 'STYLE') {
		// todo: generate name based on page filename
		this.name = 'style' + i + '.css';
	} else {
		this.name = sheet.href.substr(sheet.href.lastIndexOf('/') + 1);
	}
	this.cssRules = [].slice.call(sheet.cssRules);
}

Sheet.prototype.openOnServer = function() {
	conn.send(JSON.stringify({
		type: "openSheet",
		sheetName: this.name,
		sheetRules: this.cssRules.map(cssRuleToText)
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

function captureStylesheets() {
	[].slice.call(document.styleSheets).map(Sheet).forEach(function (sheet) {
		if (sheet.bad) return;
		sheets[sheet.name] = sheet;
		sheet.openOnServer();
	});
}

var scripts = document.getElementsByTagName('script');
var scriptSrc = scripts[scripts.length-1].src;
var url = 'ws' + scriptSrc.match(/s?:s?.*\//);
var conn = new WebSocket(url);

conn.onerror = function(err) {
	throw err;
};

conn.onopen = captureStylesheets;

conn.onmessage = function(msg) {
	var event;
	try {
		event = JSON.parse(msg.data);
	} catch(e) {
		return;
	}

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
