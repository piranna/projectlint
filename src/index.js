const {resolve} = require('path')

const tasksEngine = require('@projectlint/tasks-engine')

const {parsedTypeParse} = require('levn')
// const pkgDir = require('pkg-dir')
const {parseType} = require('type-check')


const entry = '(String | Number, Undefined | {...})'
const ruleTypeDesc = `${entry} | [${entry}] | {...}`

const ruleType = parseType(ruleTypeDesc)
const configEntryType = parseType(`(String, Undefined | ${ruleTypeDesc})`)

const levels =
{
  warn    : 1,  // output the failure
  warning : 1,  // alias of `warn`
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
    super(message || result?.message || result)

    this.result = result
  }
}


function filterDuplicated(value)
{
  if(!this.includes(value)) return this.push(value)
}

function mapConfigs(config)
{
  if(typeof config !== 'string') return config

  return parsedTypeParse(configEntryType, config)
}

function mapProjectRootResults({reason: error, value})
{
  // This could only happen by a severe crash of the `tasksEngine` instance
  if(error) return {error}

  return value
}

function normalizeRules([rule, methods])
{
  const {evaluate, fetch, fix} = methods

  if(!evaluate)
    throw new SyntaxError(`'evaluate' function not defined for rule '${rule}'`)

  const {configs, errorLevel, options, rules} = this

  methods.func = async function(context, args, fetchOptions)
  {
    let fixConfig, needFix, result

    if(fetch) result = await fetch(context, args, fetchOptions)

    for(const [level, config] of configs[rule])
      try
      {
        const evaluation = evaluate(context, args, config, result, fetchOptions)

        if(evaluation instanceof Promise)
          await evaluation
        else if(evaluation)
          throw evaluation instanceof Error
            ? evaluation
            : new Failure(evaluation)
      }
      catch(error)
      {
        needFix = true
        fixConfig = config

        // Level where a failure is considered an error
        if(!(error instanceof errorLevel)) throw error

        rules[rule].failure = error
        rules[rule].level = level
      }

    // We wait to last errors to fix the more critical ones first
    if(needFix && fix && options.fix)
      await fix(context, args, fetchOptions, result, fixConfig)

    return result
  }
}

function parseRuleConfig(value)
{
  if(!value) throw new SyntaxError('`value` argument must be set')

  // Unify as array of entries
  if(typeof value === 'number') value = [[number]]

  else
  {
    if(typeof value === 'string') value = parsedTypeParse(ruleType, value)

    if(value.constructor.name === 'Object') value = Object.entries(value)
    else if(Array.isArray(value) && !Array.isArray(value[0])) value = [value]
  }

  if(!value.length) throw new SyntaxError('`value` argument must not be empty')

  // Unify all levels as numbers
  value.forEach(unifyRuleLevel)

  // Sort rules from less to more critical
  value.sort(sortRulesConfig)

  return value
}

function projectRootResults(results)
{
  return results.map(mapProjectRootResults)
}

function sortRulesConfig([a], [b])
{
  return a - b
}

function unifyRuleLevel(entry)
{
  const key = entry[0]

  if(typeof key === 'number') return

  const level = levels[key]
  if(level == null) throw new SyntaxError(`Unknown level ${key}`)

  entry[0] = level
}


module.exports = exports = function(rules, configs, options = {})
{
  // Normalize rules
  if(!rules) throw new SyntaxError('`rules` argument must be set')

  if(Array.isArray(rules)) rules = Object.fromEntries(rules)

  // Normalize config
  if(!configs) throw new SyntaxError('`configs` argument must be set')

  if(Array.isArray(configs))
    configs = Object.fromEntries(configs.map(mapConfigs))

  for(const [rule, config] of Object.entries(configs))
    configs[rule] = parseRuleConfig(config)

  let {errorLevel = 'failure', projectRoot} = options

  switch(errorLevel)
  {
    case 'failure': errorLevel = Failure; break
    case 'error'  : errorLevel = Error  ; break

    default: throw new Error(`Unknown errorLevel '${errorLevel}'`)
  }

  if(!projectRoot?.length) projectRoot = [resolve()]
  else if(typeof projectRoot === 'string') projectRoot = [projectRoot]

  // Filter duplicated project roots
  if(projectRoot.length > 1) projectRoot = projectRoot.filter(filterDuplicated, [])

  // TODO: apply filtering and expansion of rules here

  // Normalize rules
  Object.entries(rules)
  .forEach(normalizeRules, {configs, errorLevel, options, rules})

  // Run tasks
  return Promise.allSettled(projectRoot.map(function(projectRoot)
  {
    const visited = tasksEngine(rules, configs, {context: {projectRoot}})

    const names    = Object.keys(visited)
    const promises = Object.values(visited)

    return Promise.allSettled(promises)
    .then(function(results)
    {
      return results.map(function({reason: error, value: result}, index)
      {
        const name = names[index]
        const {dependsOn, failure, level} = rules[name]

        return {dependsOn, error, failure, level, name, result}
      })
    })
  }))
  .then(projectRootResults)
}

exports.Failure = Failure
