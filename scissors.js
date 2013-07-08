var sheets = {};

var CSSKeyframesRule =
	window.WebKitCSSKeyframesRule ||
	window.MozCSSKeyframesRule ||
	window.CSSKeyframesRule;

function isKeyframesRule(rule) {
	return (rule instanceof CSSKeyframesRule);
}

var cssDeclarationRegexp = /\s*(.*?):\s*(.*?);/g;

function styleObject(domStyle) {
	var cssText = domStyle.cssText,
		style = {};
	for (var m;
		(m = cssDeclarationRegexp.exec(cssText));
		style[m[1]] = m[2]);
	return style;
}

function styleToString(style) {
	var declarations = [];
	for (var prop in style) {
		declarations.push(prop + ': ' + style[prop] + ';');
	}
	return '{' + declarations.join(' ') + ' }';
}

function keyframeRuleToString(rule) {
	return rule.keyText + styleToString(rule.style);
}

var vendor = '-webkit-';

function ruleToString(rule) {
	if (rule.type == 'rule') {
		return rule.selectorText + styleToString(rule.style);
	} else if (rule.type == 'keyframes') {
		return '@' + vendor + 'keyframes ' + rule.name + '{' +
			rule.keyframes.map(keyframeRuleToString).join(' ') + ' }';
	} else {
		console.error('Unknown type of rule', rule);
	}
}

function cssKeyframeToObject(keyframe) {
	return {
		keyText: keyframe.keyText,
		style: styleObject(keyframe.style)
	};
}

function cssRuleToObject(rule) {
	if (isKeyframesRule(rule)) {
		var keyframeRules = [].slice.call(rule.cssRules);
		return {
			type: 'keyframes',
			name: rule.name,
			keyframes: keyframeRules.map(cssKeyframeToObject)
		};
	} else {
		return {
			type: 'rule',
			selectorText: rule.selectorText,
			style: styleObject(rule.style)
		};
	}
}

// wrap and sync a CSSStyleSheet
function Sheet(name, sheet) {
	this.sheet = sheet;
	this.name = name;
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
	conn.send(JSON.stringify({
		type: "openSheet",
		name: this.name,
		source: contents,
		cssType: type,
		cssRules: [].slice.call(this.sheet.cssRules).map(cssRuleToObject)
	}));
};

function applyKeyframesDiff(keyframesRule, keyframesDiff) {
	var keyframeRules = keyframesRule.cssRules,
		skip = 0;
	for (var i = 0; i < keyframesDiff.length; i++) {
		var keyframeDiff = keyframesDiff[i];
		if (keyframeDiff.skip) {
			skip += keyframeDiff.skip;
		}
		if (keyframeDiff.remove) {
			for (var j = 0; j < keyframeDiff.remove; j++) {
				keyframesRule.deleteRule(i + skip);
			}
		}
		var keyframe = keyframeRules[i + skip];
		if (!keyframe || keyframeDiff.insert) {
			keyframesRule.insertRule(keyframeRuleToString(keyframeDiff), i + skip);
		} else {
			if (keyframeDiff.keyText) {
				keyframe.keyText = keyframeDiff.keyText;
			}
			for (var prop in keyframeDiff.style || 0) {
				keyframe.style[prop] = keyframeDiff.style[prop] || '';
			}
		}
	}
}

function applyRuleDiff(rule, ruleDiff) {
	if (isKeyframesRule(rule)) {
		// keyText, style
		if (ruleDiff.name) {
			rule.name = ruleDiff.name;
		}
		if (ruleDiff.keyframes) {
			applyKeyframesDiff(rule, ruleDiff.keyframes);
		}

	} else {
		if (ruleDiff.selectorText) {
			rule.selectorText = ruleDiff.selectorText;
		}
		for (var prop in ruleDiff.style) {
			rule.style[prop] = ruleDiff.style[prop] || '';
		}
	}
}

Sheet.prototype.applyDiff = function(rulesDiff) {
	var sheet = this.sheet,
		rules = sheet.cssRules,
		skip = 0;
	for (var i = 0; i < rulesDiff.length; i++) {
		var ruleDiff = rulesDiff[i];
		if (ruleDiff.skip) {
			skip += ruleDiff.skip;
		}
		if (ruleDiff.remove) {
			for (var j = 0; j < ruleDiff.remove; j++) {
				sheet.deleteRule(i + skip);
			}
		}
		var rule = rules[i + skip];
		if (!rule || ruleDiff.insert) {
			sheet.insertRule(ruleToString(ruleDiff), i + skip);
		} else {
			applyRuleDiff(rule, ruleDiff);
		}
	}
};

function xhr(url, cb) {
	var req = new XMLHttpRequest();
	req.open('GET', url, true);
	req.onreadystatechange = function () {
		if (req.readyState == 4) {
			cb(req.responseText);
			delete req.onreadystatechange;
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
		var cssRules;
		try {
			cssRules = link.sheet && link.sheet.cssRules;
		} catch(e) {}
		if (!cssRules) {
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
	var links = document.getElementsByTagName('link');
	[].slice.call(links).forEach(captureStylesheet);
}

var myScript = (function(scripts) {
	return scripts[scripts.length-1];
})(document.getElementsByTagName('script'));

var url = 'ws' + myScript.src.match(/s?:s?.*\//);
var conn = new WebSocket(url);

conn.onerror = function(err) {
	throw err;
};

conn.onopen = function() {
	captureStylesheets();
	console.log("Connected");
};

conn.onmessage = function(msg) {
	var event = JSON.parse(msg.data);

	if (event.type == 'rulesDiff') {
		//console.log('diff', msg.data);
		var sheet = sheets[event.sheetName];
		if (!sheet) {
			console.error('Unknown sheet', event.sheetName);
			return;
		}
		sheet.applyDiff(event.rulesDiff);
	}
};

conn.onclose = function() {
	console.log("Disconnected");
};
