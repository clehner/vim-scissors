var util = require('util'),
	EventEmitter = require('events').EventEmitter,
	cssParse = require('css-parse'),
	less = require('less');

function Sheet(name, cssRules) {
	this.name = name;
	this.cssRules = cssRules;
	EventEmitter.call(this);
}
util.inherits(Sheet, EventEmitter);

Sheet.prototype.clone = function(rules) {
	return new this.constructor(this.name, rules);
};

Sheet.prototype.emitAsync = function fn() {
	process.nextTick(fn.bind.apply(this.emit,
		[].concat.apply([this], arguments)));
};

var styleDiff = {},
	styleDiffDirty = true;

function diffStyles(from, to) {
	if (!from) {
		return to;
	}
	var prop;
	if (!to) {
		to = {};
		for (prop in from) {
			to[prop] = '';
		}
		return to;
	}
	// changed properties
	for (prop in from) {
		if (from[prop] !== to[prop]) {
			styleDiffDirty = true;
			styleDiff[prop] = to[prop] || '';
		}
	}
	// new properties
	for (prop in to) {
		if (!(prop in from)) {
			styleDiffDirty = true;
			styleDiff[prop] = to[prop];
		}
	}
	if (styleDiffDirty) {
		styleDiffDirty = false;
		var diff = styleDiff;
		styleDiff = {};
		return diff;
	}
}

var ruleDiff = {},
	ruleDirty = false;

function diffRules(ourRule, theirRule) {
	// changed selector text
	if (ourRule.selectorText !== theirRule.selectorText) {
		ruleDirty = true;
		ruleDiff.selectorText = theirRule.selectorText || null;
	}
	var styleDiff = diffStyles(ourRule.style, theirRule.style);
	if (styleDiff) {
		ruleDirty = true;
		ruleDiff.style = styleDiff;
	}
	if (ruleDirty) {
		ruleDirty = false;
		var diff = ruleDiff;
		ruleDiff = {};
		return diff;
	}
}

var keyframeDiff = {},
	keyframeDirty = false;

function diffKeyframe(ourKeyframe, theirKeyframe) {
	if (!ourKeyframe) {
		return theirKeyframe;
	}

	if (ourKeyframe.keyText != theirKeyframe.keyText) {
		keyframeDirty = true;
		keyframeDiff.keyText = theirKeyframe.keyText;
	}
	var styleDiff = diffStyles(ourKeyframe.style, theirKeyframe.style);
	if (styleDiff) {
		keyframeDirty = true;
		keyframeDiff.style = styleDiff;
	}

	if (keyframeDirty) {
		var diff = keyframeDiff;
		keyframeDiff = {};
		keyframeDirty = false;
		return diff;
	}
}

var keyframesDiff = {},
	keyframesDirty = false;

function diffKeyframes(ourKeyframes, theirKeyframes) {
	for (var key in theirKeyframes) {
		var keyframeDiff = diffKeyframe(ourKeyframes[key], theirKeyframes[key]);
		if (keyframeDiff) {
			keyframesDirty = true;
			keyframesDiff[key] = keyframeDiff;
		}
	}
	for (key in ourKeyframes) {
		if (!(key in theirKeyframes)) {
			keyframesDirty = true;
			keyframesDiff[key] = null;
		}
	}

	if (keyframesDirty) {
		var diff = keyframesDiff;
		keyframesDiff = {};
		keyframesDirty = false;
		return diff;
	}
}

var keyframesRuleDiff = {},
	keyframesRuleDirty = false;

function diffKeyframesRules(ourRule, theirRule) {
	if (theirRule.name != ourRule.name) {
		keyframesRuleDiff.name = theirRule.name;
	}
	var keyframesDiff = diffKeyframes(ourRule.keyframes, theirRule.keyframes);
	if (keyframesDiff) {
		keyframesRuleDirty = true;
		keyframesRuleDiff.keyframes = keyframesDiff;
	}
	if (keyframesRuleDirty) {
		var diff = keyframesRuleDiff;
		keyframesRuleDiff = {};
		keyframesRuleDirty = false;
		return diff;
	}
}

Sheet.prototype.getRulesDiff = function(sheet) {
	var rulesDiff = [],
		ourRules = this.cssRules,
		theirRules = sheet.cssRules || [],
		skip = 0,
		minLength = Math.min(ourRules.length, theirRules.length);

	// handle changed and added rules
	for (var i = 0; i < minLength; i++) {
		var ourRule = ourRules[i],
			theirRule = theirRules[i],
			ruleDiff;

		if (ourRule.type != theirRule.type) {
			ruleDiff = {
				insert: theirRule,
				remove: 1
			};
		} else {
			var makeDiff = ourRule.type == 'rule' ? diffRules :
				ourRule.type == 'keyframes' ? diffKeyframesRules : Error;
			ruleDiff = makeDiff(ourRule, theirRule);
		}

		if (ruleDiff) {
			if (skip) ruleDiff.skip = skip;
			skip = 0;
			//ruleDiff.old = ourRule;
			rulesDiff.push(ruleDiff);
		} else {
			skip++;
		}
	}

	if (i < theirRules.length) {
		//console.log('push more', skip, theirRules.slice(i));
		if (skip) {
			rulesDiff.push({
				skip: skip
			});
		}
		rulesDiff.push.apply(rulesDiff, theirRules.slice(i));
	} else if (i < ourRules.length) {
		//console.log('removing', ourRules.length - i);
		rulesDiff.push({
			skip: skip,
			remove: ourRules.length - i
		});
	}
	// todo: detect rules being removed from the middle of the stylesheet

	return rulesDiff;
};

Sheet.prototype.getText = function() {
	if (!this.text) {
		return this.cssRules.map(ruleToString).join("\n\n");
	}
	return this.text;
};

function declarationsToStyle(declarations) {
	var style = {};
	for (var i = 0; i < declarations.length; i++) {
		var dec = declarations[i];
		style[dec.property] = dec.value;
	}
	return style;
}

function keyframesToObject(keyframes) {
	var obj = {};
	for (var i = 0; i < keyframes.length; i++) {
		var keyframe = keyframes[i],
			keyText = keyframe.values.join(', ');
		obj[keyText] = {
			keyText: keyText,
			style: declarationsToStyle(keyframe.declarations)
		};
	}
	return obj;
}

function cssRuleToObject(rule) {
	if (rule.type == 'rule') {
		// todo: store order of the properties
		return {
			type: 'rule',
			selectorText: rule.selectors.join(', '),
			style: declarationsToStyle(rule.declarations)
		};

	} else if (rule.type == 'keyframes') {
		return {
			type: 'keyframes',
			name: rule.name,
			keyframes: keyframesToObject(rule.keyframes)
		};
	} else if (rule.type == 'comment') {
	} else {
		console.error('Unknown rule type', rule);
	}
}


function styleToString(style) {
	var declarations = [];
	for (var prop in style) {
		declarations.push(prop + ': ' + style[prop] + ';');
	}
	return '{\n' + declarations.join('\n') + '\n}';
}

function ruleToString(rule) {
	if (rule.type == 'rule') {
		return rule.selectorText + styleToString(rule.style);
	} else if (rule.type == 'keyframes') {
		var style = rule.keyframes.style,
			keyframes = [];
		for (var key in style) {
			keyframes.push(key + ' ' + styleToString(style[key]));
		}
		return '@' + (rule.vendor || '') + 'keyframes ' + rule.name +
			'{\n' + keyframes.join('\n') + '\n}';
	} else if (rule.type == 'comment') {
		return '/*' + rule.comment + '*/';
	} else {
		console.error('Unknown type of rule', rule);
	}
}

function CSSSheet(name, cssRules) {
	Sheet.call(this, name, cssRules);

	if (typeof cssRules == 'string') {
		this.text = cssRules;
		this.cssRules = [];
		var stylesheet;
		try {
			stylesheet = cssParse(cssRules).stylesheet;
		} catch(e) {
			this.emitAsync('parsed', e);
			return;
		}
		this.cssRules = stylesheet.rules.map(cssRuleToObject).filter(Boolean);
		this.emitAsync('parsed');

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules = cssRules;
		this.emitAsync('parsed');
	} else {
		console.error('Unknown type of css rules');
	}
}
util.inherits(CSSSheet, Sheet);

function LESSSheet(name, cssRules) {
	Sheet.call(this, name, cssRules);

	if (typeof cssRules == 'string') {
		this.text = cssRules;
		try {
			less.render(cssRules, this.onParsed.bind(this));
		} catch(e) {
			this.emitAsync('parsed', e);
		}

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules = cssRules;
		this.emitAsync('parsed');
	}
}
util.inherits(LESSSheet, Sheet);

LESSSheet.prototype.onParsed = function(err, css) {
	if (err) {
		this.emitAsync('parsed', err);
		return;
	}
	// todo: keep the LESS AST, and do diffs on that
	try {
		var rules = cssParse(css).stylesheet.rules;
		this.emitAsync('parsed');
		this.cssRules = rules.map(cssRuleToObject).filter(Boolean);
	} catch(e) {
		this.emitAsync('parsed', e);
	}
};
module.exports = {
	Sheet: Sheet,
	LESSSheet: LESSSheet,
	CSSSheet : CSSSheet
};
