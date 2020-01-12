const projeclint = require("../src");

describe("bad arguments", function() {
  test("no arguments", function() {
    function func() {
      projeclint();
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`rules\` argument must be set"`
    );
  });

  test("no configs", function() {
    function func() {
      projeclint({});
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`configs\` argument must be set"`
    );
  });

  test("empty rules", function() {
    function func() {
      projeclint({}, {});
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"No \`validators\` are defined"`
    );
  });

  test("rule without `evaluate` function", function() {
    const rules = {
      dumb: {}
    };

    function func() {
      projeclint(rules, {});
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"'evaluate' function not defined for rule 'dumb'"`
    );
  });

  test("empty config", function() {
    const rules = {
      dumb: {
        evaluate() {}
      }
    };

    function func() {
      projeclint(rules, {});
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"No \`rules\` are defined"`
    );
  });

  test("rules config is empty", function() {
    const rules = {
      dumb: {}
    };

    const config = [["dumb"]];

    function func() {
      projeclint(rules, config);
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`value\` argument must be set"`
    );
  });

  test("rules config has no levels", function() {
    const rules = {
      dumb: {
        evaluate() {}
      }
    };

    const config = {
      dumb: {}
    };

    function func() {
      projeclint(rules, config);
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`value\` argument must not be empty"`
    );
  });
});

test("config as string", function() {
  const rules = {
    dumb: {}
  };

  const config = ["dumb"];

  function func() {
    projeclint(rules, config);
  }

  expect(func).toThrowErrorMatchingInlineSnapshot(
    `"\`value\` argument must be set"`
  );
});

describe("evaluate", function() {
  describe("success", function() {
    test("return `undefined`", function() {
      const rules = {
        dumb: {
          evaluate() {}
        }
      };

      const config = {
        dumb: "warning"
      };

      const promise = projeclint(rules, config);

      return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  Array [
                    Object {
                      "dependsOn": undefined,
                      "error": undefined,
                      "failure": undefined,
                      "level": undefined,
                      "name": "dumb",
                      "result": undefined,
                    },
                  ],
                ]
              `);
    });

    test("return Promise object", function() {
      const rules = {
        dumb: {
          evaluate() {
            return Promise.resolve();
          }
        }
      };

      const config = {
        dumb: "warning"
      };

      const promise = projeclint(rules, config);

      return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  Array [
                    Object {
                      "dependsOn": undefined,
                      "error": undefined,
                      "failure": undefined,
                      "level": undefined,
                      "name": "dumb",
                      "result": undefined,
                    },
                  ],
                ]
              `);
    });
  });

  test("failure", function() {
    const rules = {
      dumb: {
        evaluate() {
          throw new projeclint.Failure();
        }
      }
    };

    const config = {
      dumb: { warning: null }
    };

    const promise = projeclint(rules, config);

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Array [
                  Object {
                    "dependsOn": undefined,
                    "error": undefined,
                    "failure": [Failure],
                    "level": 1,
                    "name": "dumb",
                    "result": undefined,
                  },
                ],
              ]
            `);
  });

  test("error", function() {
    const rules = {
      dumb: {
        evaluate() {
          throw new Error();
        }
      }
    };

    const config = {
      dumb: ["warning"]
    };

    const promise = projeclint(rules, config);

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Array [
                  Object {
                    "dependsOn": undefined,
                    "error": [Error],
                    "failure": undefined,
                    "level": undefined,
                    "name": "dumb",
                    "result": undefined,
                  },
                ],
              ]
            `);
  });
});

describe("multiple levels", function() {
  test("error fails", function() {
    const rules = {
      dumb: {
        evaluate(context, args, fetchOptions, result, config) {
          return config.columns < 101;
        }
      }
    };

    const config = {
      dumb: [
        ["warning", { columns: 80 }],
        ["error", { columns: 100 }]
      ]
    };

    const promise = projeclint(rules, config);

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Array [
                  Object {
                    "dependsOn": undefined,
                    "error": undefined,
                    "failure": undefined,
                    "level": undefined,
                    "name": "dumb",
                    "result": undefined,
                  },
                ],
              ]
            `);
  });

  test("error success, warning fails", function() {
    const rules = {
      dumb: {
        evaluate(context, args, fetchOptions, result, config) {
          return config.columns < 100;
        }
      }
    };

    const config = {
      dumb: [
        ["warning", { columns: 80 }],
        ["error", { columns: 100 }]
      ]
    };

    const promise = projeclint(rules, config);

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Array [
                  Object {
                    "dependsOn": undefined,
                    "error": undefined,
                    "failure": undefined,
                    "level": undefined,
                    "name": "dumb",
                    "result": undefined,
                  },
                ],
              ]
            `);
  });

  test("error and warning success", function() {
    const rules = {
      dumb: {
        evaluate(context, args, fetchOptions, result, config) {
          return config.columns < 80;
        }
      }
    };

    const config = {
      dumb: [
        ["warning", { columns: 80 }],
        ["error", { columns: 100 }]
      ]
    };

    const promise = projeclint(rules, config);

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Array [
                  Object {
                    "dependsOn": undefined,
                    "error": undefined,
                    "failure": undefined,
                    "level": undefined,
                    "name": "dumb",
                    "result": undefined,
                  },
                ],
              ]
            `);
  });
});
