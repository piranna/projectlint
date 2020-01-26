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

function normalizeRules([ruleName, {dependsOn, evaluate, fetch, fix}])
{
  if(!evaluate)
    throw new SyntaxError(`'evaluate' function not defined for rule '${ruleName}'`)

  const errorLevel = this

  const rule =
  {
    dependsOn,

    async func(context, dependenciesResults, {config, rules})
    {
      let error, fixConfig, result

      if(fetch) result = await fetch({config, context, dependenciesResults})

      rule.level = 0

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
          else if(evaluation instanceof Error)
            throw evaluation
          else if(Array.isArray(evaluation))
          {
            if(evaluation.length) throw new Failure(evaluation)
          }
          else if(evaluation)
            if(evaluation.constructor.name !== 'Object'
            || Object.keys(evaluation).length)
              throw new Failure(evaluation)
        }
        catch(err)
        {
          rule.level = level

          // Level where a failure is considered an error
          if(!(err instanceof errorLevel))
          {
            rule.result = result
            throw err
          }

          rule.failure = error = err
          fixConfig = ruleConfig
        }

      // We wait to last errors to fix the more critical ones first
      if(error && fix)
        rule.fix = async function()
        {
          return fix({
            config: fixConfig,
            context,
            dependenciesResults,
            error,
            fetch: {config, result}
          })
        }

      return result
    }
  }

  return [ruleName, rule]
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

  if(rules.constructor.name === 'Object') rules = Object.entries(rules)

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
    case 'failure': errorLevel = Failure; break
    case 'error'  : errorLevel = Error  ; break

    default: throw new Error(`Unknown errorLevel '${errorLevel}'`)
  }

  if(!projectRoot?.length) projectRoot = [resolve()]
  else if(typeof projectRoot === 'string') projectRoot = [projectRoot]

  // Filter duplicated project roots
  if(projectRoot.length > 1) projectRoot = projectRoot.filter(filterDuplicated, [])

  // TODO: apply filtering and expansion of rules here instead of tasks engine

  // Run tasks
  return projectRoot.reduce(function(acum, projectRoot)
  {
    // Normalize rules
    const projectRules = Object.fromEntries(rules.map(normalizeRules, errorLevel))

    const visited = tasksEngine(projectRules, configs, {context: {projectRoot}})

    for(const [ruleName, promise] of Object.entries(visited))
    {
      const {dependsOn} = projectRules[ruleName]

      const evaluated = promise
      .then(function(result)
      {
        const {failure, fix, level} = projectRules[ruleName]

        return {failure, fix, level, result}
      },
      function(error)
      {
        const {level, result} = projectRules[ruleName]

        return {error, level, result}
      })

      visited[ruleName] = {dependsOn, evaluated}
    }

    acum[projectRoot] = visited

    return acum
  }, {})
}

exports.Failure = Failure
