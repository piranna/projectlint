const projeclint = require('../src')


test('no arguments', function()
{
  function func() {
    projeclint()
  }

  expect(func).toThrowErrorMatchingInlineSnapshot(
    `"\`rules\` argument must be set"`
  );
})
