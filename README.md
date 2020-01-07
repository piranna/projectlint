# projectlint
A style checker and lint tool for (Node.js) projects

## API

- `projectlint(args, options = {})`
  - `options`
    - `errorLevel`: upper level where exceptions thrown by rules validation
      functions are not going to be considered errors, allowing rules depending
      of them to execute. Default is `failure`.
