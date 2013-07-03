var css = require('css');

function Sheet(name, cssRules) {
	this.name = name;
	if (typeof cssRules == 'string') {
		// from a vim client
		this.cssRules = [];
		var ast = css.parse(cssRules);
		this.cssRules = ast.stylesheet.rules.map(function (rule) {
			var style = {};
			rule.declarations.map(function (dec) {
				style[dec.property] = dec.value;
			}).join(' ') + '}';
			// todo: store order of the properties
			return {
				selectorText: rule.selectors.join(', '),
				style: style
			};
		});

	} else if (Object.prototype.toString.call(cssRules) == '[object Array]') {
		// from a browser
		this.cssRules = cssRules.map(function (rule) {
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
	} else {
		console.error('Unknown type of css rules');
	}
}

Sheet.prototype.getRulesDiff = function(sheet) {
	var rulesDiff = [];
		ourRules = this.cssRules;
		theirRules = sheet.cssRules;
		ruleDiff = {};
		styleDiff = ruleDiff.style = {};

	// handle changed and added rules
	theirRules.forEach(function (theirRule, i) {
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

Sheet.prototype.getCSSText = function() {
	return this.cssRules.map(function (rule) {
		var declarations = [];
		for (var prop in rule.style) {
			declarations.push('\t' + prop + ': ' + rule.style[prop] + ';');
		}
		return rule.selectorText + ' {\n' + declarations.join('\n') + '\n}';
	}).join("\n\n");
};

module.exports = Sheet;
