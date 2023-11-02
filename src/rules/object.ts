import {Builder, RuleBuilder} from '../builder';
import {Rule} from '../types';

export function buildRuleObject<T>(builder: Builder, rule: Rule<T>): string {
  if (rule.type !== 'object') {
    throw new Error(`Unexpected "${rule.type}" rule.`);
  }

  const {properties, required, nullable} = rule;
  const src: string[] = [];
  if (nullable) {
    src.push(`
    if (value !== undefined && value !== null) {`);
  } else {
    src.push(`
    if (value === null) {
      ${builder.addViolation({
        reason: 'object not null',
        message: 'Required object cannot be null.',
      })}
    }
    else {`);
  }

  src.push(`
      const __o = value;
      if (typeof value !== "object") {
        ${builder.addViolation(
          nullable
            ? {
                reason: 'object null',
                message: 'Required to be an object or null.',
              }
            : {
                reason: 'object',
                message: 'Required to be an object.',
              },
        )}
      }
      else {`);
  if (properties) {
    const keys = Object.keys(properties);
    if (keys.length > 0) {
      src.push(`
        const {${keys
          .map((name) => (isKeyword(name) ? `${name}: _${name}` : name))
          .join(', ')}} = __o;`);
    }
  }

  if (required && required.length > 0) {
    src.push(`
        let ok = true;`);
    for (const r of required) {
      const location = String(r);
      const name = prefixIfKeyword(location);
      src.push(`
        if (${name} === undefined) {
          ok = false;
          ${builder.addViolation({
            location,
            reason: 'required',
            message: 'Required field cannot be left blank.',
          })}
        }
        `);
    }

    src.push(`
        if (ok) {`);
  }

  if (properties) {
    for (const [name, value] of Object.entries(properties)) {
      const inner = builder.build(value as Rule<unknown>, name);
      if (inner) {
        src.push(`
  { /* ${name} */`);
        if (name !== 'value') {
          src.push(`
    const value = ${prefixIfKeyword(name)};`);
        }

        const optional = !required || !(name in required);
        if (optional) {
          src.push(`
    if (value !== undefined) {
      `);
        }

        src.push(inner);

        if (optional) {
          src.push(`
    } /* if (value !== undefined) */`);
        }

        src.push(`
  } /* ${name} */`);
      }
    }
  }

  const {patternProperties} = rule;
  if (patternProperties) {
    src.push(`
  const __keys = Object.keys(value);
  for (const __k of __keys) {`);
    if (properties) {
      const keys = Object.keys(properties);
      if (keys.length > 0) {
        src.push(`
    if (${Object.keys(properties)
      .map((p) => `__k === ${JSON.stringify(p)}`)
      .join(' || ')}) {
        continue;
    }
    `);
      }
    }

    src.push(`
    /* pattern properties */
    `);
    for (const [pattern, value] of Object.entries(patternProperties)) {
      src.push(`
    if (/${pattern}/.test(__k)) {
      const value = __o[__k];

      ${builder.build(value as Rule<unknown>, '`[${JSON.stringify(__k)}]`')}

      continue;
    }
    `);
    }

    src.push(`
  } /* for __keys */`);
  }

  if (required && required.length > 0) {
    src.push(`
        } /* if ok */`);
  }

  src.push(`
      }
    }`);

  return src.join('');
}

export const objectRuleBuilder: RuleBuilder = {
  types: ['object'],
  build: buildRuleObject,
};

function isKeyword(name: string) {
  return name === 'in';
}

function prefixIfKeyword(name: string) {
  return isKeyword(name) ? '_' + name : name;
}
