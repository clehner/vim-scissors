var sheets = {};

var CSSKeyframesRule =
	window.WebKitCSSKeyframesRule ||
	window.MozCSSKeyframesRule ||
	window.CSSKeyframesRule;

var CSSMediaRule =
	window.WebKitCSSMediaRule ||
	window.MozCSSMediaRule ||
	window.CSSMediaRule;

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
		var keyframes = [];
		for (var key in rule.keyframes) {
			var style = rule.keyframes[key].style;
			keyframes.push('\n' + key + ' ' + styleToString(style));
		}
		return '@' + vendor + 'keyframes ' + rule.name +
			' {\n' + keyframes.join('\n') + '\n}';
	} else if (rule.type == 'media') {
		return '@media ' + rule.mediaText + ' {\n' +
			rule.rules.map(ruleToString).join('\n\n') + '\n}';
	} else if (rule.type == 'comment') {
		return '/*' + rule.comment + '*/';
	} else {
		console.error('Unknown type of rule', rule);
	}
}

function cssRuleToObject(rule) {
	if (rule instanceof CSSKeyframesRule) {
		var keyframes = {};
		for (var i = 0; i < rule.cssRules.length; i++) {
			var keyframe = rule.cssRules[i];
			keyframes[keyframe.keyText] = {
				keyText: keyframe.keyText,
				style: styleObject(keyframe.style)
			};
		}
		return {
			type: 'keyframes',
			name: rule.name,
			keyframes: keyframes
		};
	} else if (rule instanceof CSSMediaRule) {
		return {
			type: 'media',
			mediaText: rule.mediaText,
			rules: [].map.call(rule.cssRules, cssRuleToObject)
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
	conn.send(JSON.stringify({
		type: "openSheet",
		name: this.name,
		source: contents,
		cssType: type,
		cssRules: [].slice.call(this.sheet.cssRules).map(cssRuleToObject)
	}));
};

function applyKeyframesDiff(keyframesRule, keyframesDiff) {
	for (var key in keyframesDiff) {
		var keyframeDiff = keyframesDiff[key];
		if (!keyframeDiff) {
			keyframesRule.deleteRule(key);
			continue;
		}
		var keyframe = keyframesRule.findRule(key);
		if (!keyframe) {
			var keyframeText = keyframeRuleToString(keyframeDiff);
			keyframesRule.insertRule(keyframeText);
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
	if (rule instanceof CSSKeyframesRule) {
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
		rules = this.cssRules,
		skip = 0,
		index = 0;
	for (var i = 0; i < rulesDiff.length; i++) {
		var ruleDiff = rulesDiff[i];
		if (ruleDiff.skip) {
			skip += ruleDiff.skip;
		}
		var rule = rules[i + skip];
		if (ruleDiff.remove) {
			for (var j = 0; j < ruleDiff.remove; j++) {
				index = i + skip;
				rule = rules[index];
				rules.splice(index, 1);
				//console.log('deleting rule', i + skip, 'out of', rules.length)
				if (rule.dummy) {
					continue;
				}
				if (rule != sheet.cssRules[index]) {
					// Rule moved. Find where it went.
					index = rules.indexOf.call(sheet.cssRules, rule);
					if (index == -1) {
						console.error('Rule disappeared', rule);
						continue;
					} else {
						//console.log('rule moved from', skip+i, 'to', index);
					}
				}
				try {
					sheet.deleteRule(index);
				} catch(e) {
					// Browser didn't support the rule, or something removed it
					console.error('Unable to delete rule', rule);
				}
			}
		}
		rule = rules[i + skip];
		if (!rule || ruleDiff.insert) {
			if (ruleDiff.insert) {
				ruleDiff = ruleDiff.insert;
			}
			if (ruleDiff.type) {
				try {
					// can't insert rule at too high an index
					index = Math.min(i + skip, sheet.cssRules.length);
					//console.log('inserting rule', ruleDiff, index);
					sheet.insertRule(ruleToString(ruleDiff), index);
					rule = sheet.cssRules[index];
				} catch(e) {
					// Unsupported CSS. Use a dummy rule.
					//console.log('Using dummy rule for', ruleDiff);
					rule = {
						dummy: true,
						style: {}
					};
				}
				rules.splice(i + skip, 0, rule);
			}
		} else {
			//console.log('applying rule diff', rule, ruleDiff);
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
	var origin = location.origin || (location.protocol + '//' + location.host);
	var path = link.href.replace(origin, '');
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
		//console.log('diff', event);
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
