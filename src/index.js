const tasksEngine = require('@projectlint/tasks-engine')

const {parsedTypeParse} = require('levn')
// const pkgDir = require('pkg-dir')
const {parseType} = require('type-check')


const parsedType = parseType('[(String, Maybe Object)]')

const levels =
{
  warn    : 1,  // output the failure
  error   : 2,  // same as `warn`. but process will exit with an error code
  critical: 3,  // same as `error`, but prevent its dependendents to execute

  // Control levels, don't affect directly to errors counting
  ignore  : -1,  // ignore the result, just pass it to its dependents
  skipIf  : -2,  // execute rule, and if it fails, skip its dependents
  skip    : -3,  // skip the rule and its dependents
  disabled: -4   // explicitly disable a rule, failing its dependents
}


class Failure extends Error
{
  name = 'Failure'

  constructor(result, message)
  {
    super(message || result.message)

    this.result = result
  }
}


function normalizeRules(entry)
{
  const {configs, levels} = this

  const [rule, methods] = entry
  const {evaluate, fetch, fix} = methods

  methods.func = async function(context, args, fetchOptions)
  {
    let fixConfig, result

    if(fetch) result = await fetch(context, args, fetchOptions)

    for(const [level, config] of configs[rule])
      try
      {
        await evaluate(context, args, fetchOptions, result, config)
      }
      catch(error)
      {
        fixConfig = config
        levels[rule] = level

        if(!(error instanceof errorLevel)) throw error
      }

    // We wait to last errors to fix the more critical ones first
    if(options.fix) await fix(context, args, fetchOptions, result, fixConfig)

    return result
  }
}

function parseRuleConfig(value)
{
  // Unify as array of entries
  if(typeof value === 'string') value = parsedTypeParse(parsedType, value)
  else if(value.constructor.name === 'Object') value = Object.entries(value)
  else if(Array.isArray(value) && !Array.isArray(value[0])) value = [value]

  // Unify all levels as numbers
  value.forEach(unifyRuleLevel)

  // Sort rules from less to more critical
  value.sort(sortRulesConfig)

  return value
}

function sortRulesConfig([a], [b])
{
  return a - b
}

function unifyRuleLevel(entry)
{
  const value = entry[1]

  if(typeof value === 'string')
  {
    const level = levels[value]
    if(level == null) throw new SyntaxError(`Unknown level ${value}`)

    entry[1] = level
  }
}


module.exports = exports = function(rules, configs, options = {})
{
  if(!rules) throw new SyntaxError('`rules` argument must be set')

  if(!Array.isArray(rules)) rules = Object.entries(rules)

  let {errorLevel = 'failure'} = options

  switch(errorLevel)
  {
    case 'failure': errorLevel = Failure; break
    case 'error'  : errorLevel = Error  ; break

    default: throw new Error(`Unknown errorLevel '${errorLevel}'`)
  }

  // Normalize config
  for(const [rule, config] of Object.entries(configs))
    configs[rule] = parseRuleConfig(config)

  // TODO: apply filtering and expansion of rules here

  // Normalize rules
  const levels = {}

  rules.forEach(normalizeRules, {configs, levels})

  // Run tasks
  const visited = tasksEngine(rules, configs)

  const names    = Object.keys(visited)
  const promises = Object.values(visited)

  return Promise.allSettled(promises)
  .then(function(results)
  {
    return results.map(function({reason: error, result}, index)
    {
      const name = names[index]
      const level = levels[name]

      return {dependsOn, error, level, name, result}
    })
  })
}

exports.Failure = Failure
