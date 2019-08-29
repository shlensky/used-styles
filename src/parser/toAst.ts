import * as postcss from 'postcss';
import {AtRule, Rule} from 'postcss';
import {createRange, localRangeMax, localRangeMin, CodeLocation, rangesIntervalEqual} from "./ranges";
import {mapStyles} from "./utils";
import {AST, StyleBodies, StyleBody, StyleSelector} from "./ast";

const getAtRule = (rule: AtRule | Rule) => {
  if (rule && rule.parent && 'name' in rule.parent && rule.parent.name == 'media') {
    return getAtRule(rule.parent as any).concat(rule.parent.params);
  }
  return [];
};

const getBreak = (rule: string) => {
  const breakPoints = [
    rule.indexOf(' '),
    rule.indexOf('>'),
    rule.indexOf('~'),
    rule.indexOf('+'),
    rule.indexOf(':'),
  ].filter(index => index > 0);
  if (breakPoints.length == 0) {
    return rule.length;
  }
  const min = Math.min(...breakPoints);
  return min ? min : rule.length;
};

const getPostfix = (rule: string) => {
  return rule.substr(getBreak(rule)).trim();
};


let bodyCounter = 1;

const assignBody = (decl: StyleBody, bodies: StyleBodies): StyleBody => {
  const d = Object.values(bodies).find(bodyDecl => rangesIntervalEqual(bodyDecl, decl));
  if (d) {
    return d;
  }
  decl.id = bodyCounter++;
  bodies[decl.id] = decl;
  return decl;
};

export const buildAst = (CSS: string, file: number = 0): AST => {
  const root = postcss.parse(CSS);
  const selectors: StyleSelector[] = [];

  root.walkAtRules(rule => {
    if (rule.name !== 'media') {
      const topName = rule.name;

      const Rule = {
        rule: rule,
        selector: '@' + rule.name + ' ' + rule.params,
        isGlobal: true,
        media: getAtRule(rule),
        decl: []
      };
      rule.walkDecls(delc => {
        Rule.decl.push(delc);
      });
      const sel = selectors[topName] || [];
      sel.push(Rule);
      selectors[topName] = sel;
    }
  });

  const bodies: StyleBodies = {};

  root.walkRules(rule => {
    const ruleSelectors = rule.selector.split(',');
    ruleSelectors
      .map(sel => sel.trim())
      .forEach(selector => {
        const stand: StyleSelector = {
          media: getAtRule(rule),
          selector: selector,
          pieces: mapStyles(selector),
          postfix: getPostfix(selector),
          declaration: 0,
        };

        const delc: StyleBody = {
          id: NaN,
          rules: [],
          start: createRange(file, Infinity, Infinity),
          end: createRange(file, 0, 0),
        };
        rule.walkDecls(({prop, value, source}) => {
          delc.start = localRangeMin(delc.start, source.start);
          delc.end = localRangeMax(delc.end, source.end);
          delc.rules.push({
            prop, value
          });
        });

        stand.declaration = assignBody(delc, bodies).id;
        selectors.push(stand);
      });
  });

  return {
    selectors,
    bodies,
  };
};