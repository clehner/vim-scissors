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
	var prop;
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

var keyframesDiff = [],
	keyframesDirty = false;

function diffKeyframes(ourKeyframes, theirKeyframes) {
	var skip = 0,
		minLength = Math.min(ourKeyframes.length, theirKeyframes.length);
	for (var i = 0; i < minLength; i++) {
		var keyframeDiff = diffKeyframe(ourKeyframes[i], theirKeyframes[i]);
		if (keyframeDiff) {
			keyframesDirty = true;
			if (skip) keyframeDiff.skip = skip;
			skip = 0;
			keyframesDiff.push(keyframeDiff);
		} else {
			skip++;
		}
	}
	if (i < theirKeyframes.length) {
		keyframesDirty = true;
		keyframesDiff.push.apply(keyframesDiff, theirKeyframes.slice(i));
	} else if (i > theirKeyframes.length) {
		keyframesDirty = true;
		keyframesDiff.push({
			remove: i - theirKeyframes.length
		});
	}

	if (keyframesDirty) {
		var diff = keyframesDiff;
		keyframesDiff = [];
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
			theirRule = theirRules[i];

		if (ourRule.type != theirRule.type) {
			theirRule.insert = true;
			theirRule.remove = 1;
			rulesDiff.push(theirRule);

		} else {
			var makeDiff = ourRule.type == 'rule' ? diffRules :
				ourRule.type == 'keyframes' ? diffKeyframesRules : Error;
			var ruleDiff = makeDiff(ourRule, theirRule);
			if (ruleDiff) {
				if (skip) ruleDiff.skip = skip;
				skip = 0;
				//ruleDiff.old = ourRule.style;
				rulesDiff.push(ruleDiff);
			} else {
				skip++;
			}
		}
	}

	if (i < theirRules.length) {
		rulesDiff.push.apply(rulesDiff, theirRules.slice(i));
	} else if (i > theirRules.length) {
		rulesDiff.push({
			remove: i - theirRules.length
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

function keyFrameToObject(keyframe) {
	return {
		keyText: keyframe.values.join(', '),
		style: declarationsToStyle(keyframe.declarations)
	};
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
			keyframes: rule.keyframes.map(keyFrameToObject)
		};
	} else if (rule.type == 'comment') {
	} else {
		console.error('Unknown rule type', rule);
	}
}

function ruleToString(rule) {
	var selectorText;
	if (rule.type == 'keyframes') {
		selectorText = '@' + rule.vendor + 'keyframes ' + rule.name;
		var keyframes = rule.keyframes.map(ruleToString);
		return selectorText + '{\n' + keyframes.join('\n') + '\n}';
	} else if (rule.type == 'rule') {
		var declarations = [];
		for (var prop in rule.style) {
			declarations.push('\t' + prop + ': ' + rule.style[prop] + ';');
		}
		selectorText = rule.selectorText || rule.name;
		return selectorText + ' {\n' + declarations.join('\n') + '\n}';
	} else if (rule.type == 'comment') {
		return '/*' + rule.comment + '*/';
	} else {
		console.error('Unknown rule type', rule);
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
