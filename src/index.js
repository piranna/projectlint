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

function normalizeRules([ruleName, rule])
{
  const {evaluate, fetch, fix: fixFunc} = rule

  if(!evaluate)
    throw new SyntaxError(`'evaluate' function not defined for rule '${ruleName}'`)

  const {errorLevel, fix} = this

  rule.func = async function(context, dependenciesResults, {config, rules})
  {
    let fixConfig, needFix, result

    if(fetch) result = await fetch({config, context, dependenciesResults})

    for(const [level, ruleConfig] of rules)
      try
      {
        const evaluation = evaluate({
          config: ruleConfig,
          context,
          dependenciesResults,
          fetch: {config, result}
        })

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
        fixConfig = ruleConfig

        // Level where a failure is considered an error
        if(!(error instanceof errorLevel)) throw error

        rule.failure = error
        rule.level = level
      }

    // We wait to last errors to fix the more critical ones first
    if(needFix && fixFunc && fix)
      await fix({
        config: fixConfig,
        context,
        dependenciesResults,
        fetch: {config, result}
      })

    return result
  }
}

function parseRuleConfig(rules)
{
  if(!rules) throw new SyntaxError('`rules` argument must be set')

  let config
  if(rules.rules != null)
  {
    config = {...rules}
    delete config.rules

    rules = rules.rules
  }

  // Unify as array of entries
  if(typeof rules === 'number') rules = [[number]]

  else
  {
    if(typeof rules === 'string') rules = parsedTypeParse(ruleType, rules)

    if(rules.constructor.name === 'Object') rules = Object.entries(rules)
    else if(Array.isArray(rules) && !Array.isArray(rules[0])) rules = [rules]
  }

  if(!rules.length) throw new SyntaxError('`rules` argument must not be empty')

  // Unify all levels as numbers
  rules.forEach(unifyRuleLevel)

  // Sort rules from less to more critical
  rules.sort(sortRulesConfig)

  return {config, rules}
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
  if(level == null) throw new SyntaxError(`Unknown level '${key}'`)

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

  for(const [ruleName, config] of Object.entries(configs))
    configs[ruleName] = parseRuleConfig(config)

  // Normalize error level and project root
  let {errorLevel = 'failure', projectRoot} = options

  switch(errorLevel)
  {
    case 'failure': options.errorLevel = Failure; break
    case 'error'  : options.errorLevel = Error  ; break

    default: throw new Error(`Unknown errorLevel '${errorLevel}'`)
  }

  if(!projectRoot?.length) projectRoot = [resolve()]
  else if(typeof projectRoot === 'string') projectRoot = [projectRoot]

  // Filter duplicated project roots
  if(projectRoot.length > 1) projectRoot = projectRoot.filter(filterDuplicated, [])

  // TODO: apply filtering and expansion of rules here

  // Normalize rules
  Object.entries(rules).forEach(normalizeRules, options)

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

        return {dependsOn, error, failure, level, name, projectRoot, result}
      })
    })
  }))
  .then(projectRootResults)
}

exports.Failure = Failure
