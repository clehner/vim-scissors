/* Style declaration */

var CSSKeyframesRule =
	window.WebKitCSSKeyframesRule ||
	window.MozCSSKeyframesRule ||
	window.CSSKeyframesRule;

var CSSMediaRule =
	window.WebKitCSSMediaRule ||
	window.MozCSSMediaRule ||
	window.CSSMediaRule;

function Style() {}

Style.declarationRegexp = /\s*(.*?):\s*(.*?);/g;
Style.priorityRegep = /(.*) ?!important/;

Style.prototype.initCSS = function(domStyle) {
	this.domStyle = domStyle;
	this.style = {};
	var cssText = domStyle.cssText;
	for (var m;
		(m = Style.declarationRegexp.exec(cssText));
		this.style[m[1]] = m[2]);
	return this;
};

Style.prototype.setCSSStyle = function(domStyle) {
	this.domStyle = domStyle;
};

Style.prototype.initJSON = function(obj) {
	this.style = obj;
	return this;
};

Style.prototype.toString = function() {
	var declarations = [];
	for (var prop in this.style) {
		declarations.push(prop + ': ' + this.style[prop] + ';');
	}
	return '{' + declarations.join(' ') + ' }';
};

Style.prototype.toJSON = function() {
	return this.style;
};

Style.prototype.applyDiff = function(diff) {
	for (var prop in diff) {
		var value = diff[prop] || '';
		this.domStyle[prop] = value;
		var m = Style.priorityRegep.exec(value);
		if (m) {
			value = m[1];
			this.domStyle.setProperty(prop, value, '!important');
		} else {
			this.domStyle[prop] = value;
		}
	}
};

var vendor = '-webkit-';

// wrap and sync a CSSStyleSheet
function Sheet(name, sheet) {
	this.sheet = sheet;
	this.name = name;
	this.rules = new RulesList().initCSS(sheet);
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
		cssRules: this.rules.toJSON()
	}));
};

Sheet.prototype.applyDiff = function(diff) {
	if (diff.rules) {
		this.rules.applyDiff(diff.rules);
	}
	// todo: diff mediaText
};

/* Regular CSS Rule */

function Rule() {}

Rule.types = {
	'rule': Rule,
	'keyframes': KeyframesRule,
	'media': MediaRule,
	'comment': Comment
};

Rule.dummy = {
	dummy: true,
	json: {
		dummy: true,
		style: {}
	},
	toString: function() {
		return '';
	},
	applyDiff: function() {
		console.log('Applying diff to dummy');
	},
	toJSON: function() {
		return this.json;
	}
};

Rule.fromCSS = function(cssRule) {
	var MyRule =
		cssRule instanceof CSSKeyframesRule ? KeyframesRule :
		cssRule instanceof CSSMediaRule ? MediaRule :
		Rule;
	return new MyRule().initCSS(cssRule);
};

Rule.fromJSON = function(obj) {
	var MyRule = Rule.types[obj.type];
	if (!MyRule) {
		console.error('Unknown type of rule', obj);
		return;
	}
	return new MyRule().initJSON(obj);
};

Rule.prototype.initCSS = function(cssRule) {
	this.cssRule = cssRule;
	this.selectorText = cssRule.selectorText;
	this.style = new Style().initCSS(cssRule.style);
	return this;
};

Rule.prototype.initJSON = function(obj) {
	this.selectorText = obj.selectorText;
	this.style = new Style().initJSON(obj.style);
	return this;
};

Rule.prototype.toString = function() {
	return this.selectorText + this.style.toString();
};

Rule.prototype.toJSON = function() {
	return {
		type: 'rule',
		selectorText: this.selectorText,
		style: this.style.toJSON()
	};
};

Rule.prototype.applyDiff = function(diff) {
	if (diff.selectorText) {
		this.cssRule.selectorText = this.selectorText = diff.selectorText;
	}
	if (diff.style) {
		this.style.applyDiff(diff.style);
	}
};

/* Keyframes Rule */

function KeyframesRule() {
	this.keyframes = new Keyframes();
}

KeyframesRule.prototype.initCSS = function(cssRule) {
	this.cssRule = cssRule;
	this.name = cssRule.name;
	this.keyframes.initCSS(cssRule);
	return this;
};

KeyframesRule.prototype.initJSON = function(obj) {
	this.name = obj.name;
	this.keyframes.initJSON(obj.keyframes);
	return this;
};

KeyframesRule.prototype.toString = function() {
	return '@' + vendor + 'keyframes ' + this.name +
		' {\n' + this.keyframes.toString() + '\n}';
};

KeyframesRule.prototype.toJSON = function() {
	return {
		type: 'keyframes',
		name: this.name,
		keyframes: this.keyframes.toJSON()
	};
};

KeyframesRule.prototype.applyDiff = function(diff) {
	if (diff.name) {
		this.name = this.cssRule.name = diff.name;
	}
	if (diff.keyframes) {
		this.keyframes.applyDiff(diff.keyframes);
	}
};

/* Keyframes */

function Keyframes() {}

Keyframes.keywords = {
	from: '0%',
	to: '100%'
};

Keyframes.prototype.initCSS = function(cssRule) {
	var cssKeyframes = cssRule.cssRules;
	this.cssRule = cssRule;
	this.keyframes = {};
	for (var i = 0; i < cssKeyframes.length; i++) {
		var keyframe = new Keyframe().initCSS(cssKeyframes[i]);
		this.keyframes[keyframe.keyText] = keyframe;
	}
	return this;
};

Keyframes.prototype.initJSON = function(obj) {
	this.keyframes = {};
	for (var key in obj) {
		this.keyframes[key] = new Keyframe().initJSON(obj[key]);
	}
	return this;
};

Keyframes.prototype.toString = function() {
	var keyframes = [];
	for (var key in this.keyframes) {
		keyframes.push(this.keyframes[key].toString());
	}
	return keyframes.join('\n\n');
};

Keyframes.prototype.toJSON = function () {
	var obj = {};
	for (var key in this.keyframes) {
		obj[key] = this.keyframes[key].toJSON();
	}
	return obj;
};

Keyframes.prototype.applyDiff = function (diff) {
	for (var key in diff) {
		var keyframeDiff = diff[key];
		if (!keyframeDiff) {
			delete this.keyframes[key];
			this.cssRule.deleteRule(key);
		} else {
			var mappedKey = Keyframes.keywords[key] || key;
			var keyframe = this.keyframes[mappedKey];
			var cssKeyframe = this.cssRule.findRule(key);
			if (keyframe.cssKeyframe != cssKeyframe) {
				console.error('Mismatched keyframe');
			}
			if (keyframe) {
				keyframe.applyDiff(keyframeDiff);
			} else {
				keyframe = new Keyframe().initJSON(keyframeDiff);
				this.cssRule.insertRule(keyframe.toString());
			}
		}
	}
};

/* Keyframe */

function Keyframe() {}

Keyframe.prototype.initCSS = function(cssKeyframe) {
	this.cssKeyframe = cssKeyframe;
	this.keyText = cssKeyframe.keyText;
	this.style = new Style().initCSS(cssKeyframe.style);
	return this;
};

Keyframe.prototype.initJSON = function(obj) {
	this.keyText = obj.keyText;
	this.style = new Style().initJSON(obj.style);
	return this;
};

Keyframe.prototype.toString = function() {
	return this.keyText + ' ' + this.style.toString();
};

Keyframe.prototype.toJSON = function() {
	return {
		keyText: this.keyText,
		style: this.style.toJSON()
	};
};

Keyframe.prototype.applyDiff = function(diff) {
	if (diff.keyText) {
		this.keyText = this.cssKeyframe.keyText = diff.keyText;
	}
	if (diff.style) {
		var style = this.cssKeyframe.style;
		for (var prop in diff.style) {
			this.style[prop] = style[prop] = diff.style[prop] || '';
		}
	}
};

/* Media Rule */

function MediaRule() {}

MediaRule.prototype.initCSS = function(cssRule) {
	this.cssRule = cssRule;
	this.mediaText = cssRule.media.mediaText;
	this.rules = new RulesList().initCSS(cssRule);
	return this;
};

MediaRule.prototype.initJSON = function(obj) {
	this.mediaText = obj.mediaText;
	this.rules = new RulesList().initJSON(obj.rules);
	return this;
};

MediaRule.prototype.toString = function() {
	return '@media ' + this.mediaText + ' {\n' +
		this.rules.toString() + '\n}';
};

MediaRule.prototype.toJSON = function() {
	return {
		type: 'media',
		mediaText: this.mediaText,
		rules: this.rules.toJSON()
	};
};

MediaRule.prototype.applyDiff = function(diff) {
	if (diff.mediaText) {
		this.mediaText = diff.mediaText;
		this.cssRule.mediaText = diff.mediaText;
	}
	if (diff.rules) {
		this.rules.applyDiff(diff.rules);
	}
};

/* Comment */

function Comment() {}

Comment.prototype.initJSON = function(obj) {
	this.text = obj.text;
};

Comment.prototype.toString = function() {
	return '/*' + this.text + '*/';
};

/* Rules List */

function RulesList() {}

RulesList.prototype.initCSS = function(sheet) {
	// note: sheet may be a CSSMediaRule
	this.sheet = sheet;
	this.rules = [].map.call(sheet.cssRules, Rule.fromCSS);
	return this;
};

RulesList.prototype.initJSON = function(obj) {
	this.rules = obj.map(Rule.fromJSON).filter(Boolean);
	return this;
};

RulesList.prototype.toJSON = function() {
	return this.rules.map(function (rule) {
		return rule.toJSON();
	});
};

RulesList.prototype.toString = function() {
	// implicit toString on each rule
	return this.rules.join('\n\n');
};

RulesList.prototype.applyDiff = function(diff) {
	var skip = 0,
		index = 0;
	for (var i = 0; i < diff.length; i++) {
		var ruleDiff = diff[i];
		if (ruleDiff.skip) {
			skip += ruleDiff.skip;
		}
		var rule = this.rules[i + skip];

		for (var j = 0; j < ruleDiff.remove; j++) {
			index = i + skip;
			rule = this.rules[index];
			this.rules.splice(index, 1);
			//console.log('deleting rule', i + skip, 'out of', rules.length)
			if (rule.dummy) {
				continue;
			}
			if (rule.cssRule != this.sheet.cssRules[index]) {
				// Rule moved. Find where it went.
				index = [].indexOf.call(this.sheet.cssRules, rule.cssRule);
				if (index == -1) {
					console.error('Rule disappeared', rule);
					continue;
				} else {
					//console.log('rule moved from', skip+i, 'to', index);
				}
			}
			try {
				this.sheet.deleteRule(index);
			} catch(e) {
				// Browser didn't support the rule, or something removed it
				console.error('Unable to delete rule', rule);
			}
		}

		rule = this.rules[i + skip];
		if (!rule || ruleDiff.insert) {
			if (ruleDiff.insert) {
				ruleDiff = ruleDiff.insert;
			}
			if (ruleDiff.type) {
				// can't insert rule at too high an index
				index = Math.min(i + skip, this.sheet.cssRules.length);
				//console.log('inserting rule', ruleDiff, index);
				rule = Rule.fromJSON(ruleDiff);
				var cssOk;
				try {
					this.sheet.insertRule(rule.toString(), index);
					cssOk = true;
				} catch(e) {
					// Unsupported CSS. Use a dummy rule.
					console.log('Using dummy rule for', ruleDiff, e.stack);
					rule = Rule.dummy;
				}
				if (cssOk) {
					rule.initCSS(this.sheet.cssRules[index]);
				}
				this.rules.splice(i + skip, 0, rule);
			}

		} else {
			rule.applyDiff(ruleDiff);
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

var sheets = {};

function openStylesheet(name, type, sheet, contents) {
	var resource = new Sheet(name, sheet);
	sheets[name] = resource;
	resource.openOnServer(contents, type);
}

function captureStylesheet(link) {
	var origin = location.origin || (location.protocol + '//' + location.host);
	var path = link.href.replace(origin, '');
	var name = link.getAttribute('href');
	if (link.rel == 'stylesheet') {
		var cssRules;
		try {
			cssRules = link.sheet && link.sheet.cssRules;
		} catch(e) {}
		if (!cssRules) {
			//console.log('Unreachable stylesheet', path);
			return;
		}
		xhr(link.href, openStylesheet.bind(this, name, 'css', link.sheet));

	} else if (link.rel == 'stylesheet/less') {
		var id = path.replace(/\//g, '-').replace(/^-*(.*)\.(.*?)$/, '$2:$1');
		var style = document.getElementById(id);
		var sheet = style && style.sheet;
		if (!sheet || !sheet.cssRules) {
			console.log('Creating Less stylesheet for', id);
			style = document.createElement('style');
			document.getElementsByTagName('head')[0].appendChild(style);
		}
		xhr(link.href, openStylesheet.bind(this, name, 'less', style.sheet));
	}
}

function captureStylesheets() {
	var links = document.getElementsByTagName('link');
	[].forEach.call(links, captureStylesheet);
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
