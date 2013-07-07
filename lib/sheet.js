var util = require('util'),
	EventEmitter = require('events').EventEmitter,
	cssParse = require('css-parse'),
	less = require('less');

var sheetTypes = {};

function Sheet(name, cssRules) {
	var self = this;
	this.name = name;
	EventEmitter.call(this);
}
util.inherits(Sheet, EventEmitter);

Sheet.prototype.clone = function(rules) {
	return new this.constructor(this.name, rules);
};

Sheet.prototype.emitAsync = function fn() {
	process.nextTick(fn.bind.apply(this.emit, [].concat.apply([this], arguments)));
};

Sheet.prototype.getRulesDiff = function(sheet) {
	var rulesDiff = [];
		ourRules = this.cssRules;
		theirRules = sheet.cssRules;
		ruleDiff = {};
		styleDiff = ruleDiff.style = {};

	// handle changed and added rules
	if (theirRules) theirRules.forEach(function (theirRule, i) {
		var ourRule = ourRules[i],
			ourStyle = ourRule && ourRule.style;
		if (!ourStyle) {
			// new rule
			theirRule.index = ourRules.length;
			rulesDiff.push(theirRule);
			return;
		}
		var theirStyle = theirRule.style,
			dirty = false,
			prop;

		// changed selector text
		if (ourRule.selectorText !== theirRule.selectorText) {
			dirty = true;
			ruleDiff.selectorText = theirRule.selectorText || null;
		}
		// changed properties
		for (prop in ourStyle) {
			if (theirStyle[prop] !== ourStyle[prop]) {
				dirty = true;
				styleDiff[prop] = theirStyle[prop] || '';
			}
		}
		// new properties
		for (prop in theirStyle) {
			if (!(prop in ourStyle)) {
				dirty = true;
				styleDiff[prop] = theirStyle[prop];
			}
		}

		if (dirty) {
			ruleDiff.index = i;
			rulesDiff.push(ruleDiff);

			// create object for next iteration
			ruleDiff = {};
			styleDiff = ruleDiff.style = {};
		}
	});
	
	// handle removed rules
	for (var i = theirRules.length; i < ourRules.length; i++) {
		rulesDiff.push({
			index: i,
			remove: true
		});
	}
	// todo: detect rules being removed from the middle of the stylesheet

	return rulesDiff;
};

Sheet.prototype.getText = function() {
    if (!this.text) {
        return this.cssRules.map(function (rule) {
            var declarations = [];
            for (var prop in rule.style) {
                declarations.push('\t' + prop + ': ' + rule.style[prop] + ';');
            }
            return rule.selectorText + ' {\n' + declarations.join('\n') + '\n}';
        }).join("\n\n");
    }
    return this.text;
};

function rulesArrayToObject(rules) {
	return rules.map(function (rule) {
		var i = rule.indexOf('{');
		var selectors = rule.substr(0, i-1).split(/,\s*/).filter(Boolean);
		var declarations = rule.substring(i+2, rule.length-1).split(/;\s*/);
		var style = {};
		declarations.forEach(function (declaration) {
			var m = declaration.match(/^(.*):\s*(.*)$/);
			if (m) style[m[1]] = m[2];
		});
		return {
			selectorText: selectors.join(', '),
			style: style
		};
	});
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
		this.cssRules = stylesheet.rules.map(function (rule) {
			var style = {};
			if (!rule.declarations) {
				//console.log('Rule without declarations', rule);
				return;
			}
			if (rule.type == 'rule') {
				rule.declarations.map(function (dec) {
					style[dec.property] = dec.value;
				}).join(' ') + '}';
				// todo: store order of the properties
				return {
					selectorText: rule.selectors.join(', '),
					style: style
				};
			}
		}).filter(Boolean);
		this.emitAsync('parsed');

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules = rulesArrayToObject(cssRules);
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
		less.render(cssRules, function(err, css) {
			if (err) {
				this.emitAsync('parsed', err);
				return;
			}
			// todo: keep the LESS AST, and do diffs on that
			var ast = cssParse(css);
			this.cssRules = ast.stylesheet.rules.map(function (rule) {
				var style = {};
				if (!rule.declarations) {
					//console.log('Rule without declarations', rule);
					return;
				}
				rule.declarations.map(function (dec) {
					style[dec.property] = dec.value;
				}).join(' ') + '}';
				return {
					selectorText: rule.selectors.join(', '),
					style: style
				};
			}).filter(Boolean);
			this.emitAsync('parsed');
		}.bind(this));

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules = rulesArrayToObject(cssRules);
		this.emitAsync('parsed');
	}
}
util.inherits(LESSSheet, Sheet);

module.exports = {
	Sheet: Sheet,
	LESSSheet: LESSSheet,
	CSSSheet : CSSSheet
};
