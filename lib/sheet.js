var util = require('util'),
	EventEmitter = require('events').EventEmitter,
	cssParse = require('css-parse'),
	less = require('less');

function Sheet(name) {
	this.name = name;
	this.cssRules = new RulesList();
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

Sheet.prototype.getDiff = function(sheet) {
	// todo: mediatext
	return {
		rules: this.cssRules.diff(sheet.cssRules)
	};
};

Sheet.prototype.getText = function() {
	return this.text || this.rules.toString();
};

/* Style declaration */

function Style() {}

Style.prototype.initCSS = function(declarations) {
	// todo: store order of the properties
	this.style = {};
	for (var i = 0; i < declarations.length; i++) {
		var dec = declarations[i];
		this.style[dec.property] = dec.value;
	}
	return this;
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
	if (!this.style) throw new Error('Empty style');
	return this.style;
};

var styleDiff = {},
	styleDiffDirty = true;

Style.prototype.diff = function(other) {
	var prop,
		from = this.style,
		to = other && other.style;
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
};

/* Regular CSS Rule */

function Rule() {}

Rule.types = {
	'rule': Rule,
	'keyframes': KeyframesRule,
	'media': MediaRule,
	'comment': null
};

Rule.fromType = function(obj) {
	if (!Rule.types.hasOwnProperty(obj.type)) {
		console.error('Unknown type of rule', obj);
		return;
	}
	return Rule.types[obj.type];
};

Rule.fromCSS = function(obj) {
	var MyRule = Rule.fromType(obj);
	return MyRule && new MyRule().initCSS(obj);
};

Rule.fromJSON = function(obj) {
	var MyRule = Rule.fromType(obj);
	return MyRule && new MyRule().initJSON(obj);
};

Rule.prototype.initCSS = function(obj) {
	this.selectorText = obj.selectors.join(', ');
	this.style = new Style().initCSS(obj.declarations);
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

var ruleDiff = {},
	ruleDirty = false;

Rule.prototype.diff = function(other) {
	// changed selector text
	if (this.selectorText !== other.selectorText) {
		ruleDirty = true;
		ruleDiff.selectorText = other.selectorText || null;
	}
	// changed styles
	var styleDiff = this.style.diff(other.style);
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
};

/* Keyframes Rule */

function KeyframesRule() {
	this.keyframes = new Keyframes();
}

KeyframesRule.prototype.initCSS = function(obj) {
	this.name = obj.name;
	this.vendor = obj.vendor || '';
	this.keyframes.initCSS(obj.keyframes);
	return this;
};

KeyframesRule.prototype.initJSON = function(obj) {
	this.name = obj.name;
	this.vendor = obj.vendor || '';
	this.keyframes.initJSON(obj.keyframes);
	return this;
};

KeyframesRule.prototype.toString = function() {
	return '@' + this.vendor + 'keyframes ' + this.name +
		' {\n' + this.keyframes.toString() + '\n}';
};

KeyframesRule.prototype.toJSON = function() {
	return {
		type: 'keyframes',
		name: this.name,
		keyframes: this.keyframes.toJSON()
	};
};

var keyframesRuleDiff = {},
	keyframesRuleDirty = false;

KeyframesRule.prototype.diff = function(other) {
	if (other.name != this.name) {
		keyframesRuleDirty = true;
		keyframesRuleDiff.name = other.name;
	}
	if (other.vendor != this.vendor) {
		keyframesRuleDirty = true;
		keyframesRuleDiff.vendor = other.vendor;
	}
	var keyframesDiff = this.keyframes.diff(other.keyframes);
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
};

/* Keyframes */

function Keyframes() {}

Keyframes.prototype.initCSS = function(keyframes) {
	this.keyframes = {};
	for (var i = 0; i < keyframes.length; i++) {
		var keyframe = new Keyframe().initCSS(keyframes[i]);
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

var keyframesDiff = {},
	keyframesDirty = false;

Keyframes.prototype.diff = function(other) {
	for (var key in other.keyframes) {
		var myKeyframe = this.keyframes[key],
			otherKeyframe = other.keyframes[key];
		var keyframeDiff = myKeyframe ?
			myKeyframe.diff(otherKeyframe) :
			otherKeyframe;
		if (keyframeDiff) {
			keyframesDirty = true;
			keyframesDiff[key] = keyframeDiff;
		}
	}
	for (key in this.keyframes) {
		if (!(key in other.keyframes)) {
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
};

/* Keyframe */

function Keyframe() {}

Keyframe.prototype.initCSS = function(obj) {
	this.keyText = obj.values.join(', ');
	this.style = new Style().initCSS(obj.declarations);
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

var keyframeDiff = {},
	keyframeDirty = false;

Keyframe.prototype.diff = function(other) {
	if (!other) {
		return this.toJSON();
	}
	if (this.keyText != other.keyText) {
		keyframeDirty = true;
		keyframeDiff.keyText = other.keyText;
	}
	var styleDiff = this.style.diff(other.style);
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
};

/* Media Rule */

function MediaRule() {}

MediaRule.prototype.initCSS = function(obj) {
	this.mediaText = obj.media;
	this.rules = new RulesList().initCSS(obj.rules);
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

var mediaRuleDiff = {},
	mediaRuleDirty = false;

MediaRule.prototype.diff = function(other) {
	if (other.mediaText != this.mediaText) {
		mediaRuleDiff.mediaText = other.mediaText;
	}
	if (!other.rules) {
		console.log('no rules', other);
	}
	var rulesListDiff = this.rules.diff(other.rules);
	if (rulesListDiff) {
		mediaRuleDirty = true;
		mediaRuleDiff.rules = rulesListDiff;
	}
	if (mediaRuleDirty) {
		var diff = mediaRuleDiff;
		mediaRuleDiff = {};
		mediaRuleDirty = false;
		return diff;
	}
};

/* Rules List */

function RulesList() {}

RulesList.prototype.initCSS = function(rules) {
	// filter boolean to remove comments and unknown rule types
	this.rules = rules.map(Rule.fromCSS).filter(Boolean);
	return this;
};

RulesList.prototype.initJSON = function(obj) {
	this.rules = obj.map(Rule.fromJSON).filter(Boolean);
	return this;
};

RulesList.prototype.toString = function() {
	// implicit toString on each rule
	return this.rules.join('\n\n');
};

RulesList.prototype.toJSON = function() {
	return this.rules.map(function (rule) {
		return rule.toJSON();
	});
};

RulesList.prototype.diff = function(other) {
	var rulesDiff = [],
		skip = 0,
		minLength = Math.min(this.rules.length, other.rules.length);

	// handle changed and added rules
	for (var i = 0; i < minLength; i++) {
		var ourRule = this.rules[i],
			theirRule = other.rules[i],
			ruleDiff;

		// different rule type
		if (ourRule.constructor != theirRule.constructor) {
			ruleDiff = {
				insert: theirRule.toJSON(),
				remove: 1
			};
		} else {
			ruleDiff = ourRule.diff(theirRule);
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

	if (i < other.rules.length) {
		//console.log('push more', skip, theirRules.slice(i));
		if (skip) {
			rulesDiff.push({
				skip: skip
			});
		}
		for (; i < other.rules.length; i++) {
			rulesDiff.push(other.rules[i].toJSON());
		}
	} else if (i < this.rules.length) {
		//console.log('removing', ourRules.length - i);
		rulesDiff.push({
			skip: skip,
			remove: this.rules.length - i
		});
	}
	// todo: detect rules being removed from the middle of the stylesheet

	if (rulesDiff.length) {
		return rulesDiff;
	}
};


function CSSSheet(name, cssRules) {
	Sheet.call(this, name);

	if (typeof cssRules == 'string') {
		this.text = cssRules;
		var stylesheet;
		try {
			stylesheet = cssParse(cssRules).stylesheet;
		} catch(e) {
			this.emitAsync('parsed', e);
			return;
		}
		//.filter(Boolean);
		this.cssRules.initCSS(stylesheet.rules);
		this.emitAsync('parsed');

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules.initJSON(cssRules);
		this.emitAsync('parsed');
	} else {
		console.error('Unknown type of css rules');
	}
}
util.inherits(CSSSheet, Sheet);

function LESSSheet(name, cssRules) {
	Sheet.call(this, name);

	if (typeof cssRules == 'string') {
		this.text = cssRules;
		try {
			less.render(cssRules, this.onParsed.bind(this));
		} catch(e) {
			this.emitAsync('parsed', e);
		}

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules.initJSON(cssRules);
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
		//.filter(Boolean);
		this.cssRules.initCSS(rules);
	} catch(e) {
		this.emitAsync('parsed', e);
	}
};

module.exports = {
	Sheet: Sheet,
	LESSSheet: LESSSheet,
	CSSSheet : CSSSheet
};
