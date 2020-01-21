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
      `"\`rules\` argument must be set"`
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
      `"\`rules\` argument must not be empty"`
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
    `"\`rules\` argument must be set"`
  );
});

function getPromises(projects) {
  return Promise.all(
    Object.values(projects).flatMap(function(project) {
      return Object.values(project).map(function({ evaluated }) {
        return evaluated;
      });
    })
  );
}

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

      const result = projeclint(rules, config);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "/home/piranna/github/projectlint/projectlint": Object {
            "dumb": Object {
              "dependsOn": undefined,
              "evaluated": Promise {},
            },
          },
        }
      `);

      return expect(getPromises(result)).resolves.toMatchInlineSnapshot(`
                          Array [
                            Object {
                              "failure": undefined,
                              "fix": undefined,
                              "level": undefined,
                              "result": undefined,
                            },
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

      const result = projeclint(rules, config);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "/home/piranna/github/projectlint/projectlint": Object {
            "dumb": Object {
              "dependsOn": undefined,
              "evaluated": Promise {},
            },
          },
        }
      `);

      return expect(getPromises(result)).resolves.toMatchInlineSnapshot(`
                        Array [
                          Object {
                            "failure": undefined,
                            "fix": undefined,
                            "level": undefined,
                            "result": undefined,
                          },
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

    const result = projeclint(rules, config);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "/home/piranna/github/projectlint/projectlint": Object {
          "dumb": Object {
            "dependsOn": undefined,
            "evaluated": Promise {},
          },
        },
      }
    `);

    return expect(getPromises(result)).resolves.toMatchInlineSnapshot(`
      Array [
        Object {
          "failure": [Failure],
          "fix": undefined,
          "level": 1,
          "result": undefined,
        },
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

    const result = projeclint(rules, config);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "/home/piranna/github/projectlint/projectlint": Object {
          "dumb": Object {
            "dependsOn": undefined,
            "evaluated": Promise {},
          },
        },
      }
    `);

    return expect(
      getPromises(result)
    ).resolves.toThrowErrorMatchingInlineSnapshot(`undefined`);
  });
});

describe("multiple levels", function() {
  test("error fails", function() {
    const columns = 101;

    const rules = {
      dumb: {
        evaluate({ config }) {
          return config.columns < columns;
        }
      }
    };

    const config = {
      dumb: [
        ["warning", { columns: 80 }],
        ["error", { columns: 100 }]
      ]
    };

    const result = projeclint(rules, config);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "/home/piranna/github/projectlint/projectlint": Object {
          "dumb": Object {
            "dependsOn": undefined,
            "evaluated": Promise {},
          },
        },
      }
    `);

    return expect(getPromises(result)).resolves.toMatchInlineSnapshot(`
      Array [
        Object {
          "failure": [Failure: true],
          "fix": undefined,
          "level": 2,
          "result": undefined,
        },
      ]
    `);
  });

  test("error success, warning fails", function() {
    const columns = 100;

    const rules = {
      dumb: {
        evaluate({ config }) {
          return config.columns < columns;
        }
      }
    };

    const config = {
      dumb: [
        ["warning", { columns: 80 }],
        ["error", { columns: 100 }]
      ]
    };

    const result = projeclint(rules, config);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "/home/piranna/github/projectlint/projectlint": Object {
          "dumb": Object {
            "dependsOn": undefined,
            "evaluated": Promise {},
          },
        },
      }
    `);

    return expect(getPromises(result)).resolves.toMatchInlineSnapshot(`
      Array [
        Object {
          "failure": [Failure: true],
          "fix": undefined,
          "level": 1,
          "result": undefined,
        },
      ]
    `);
  });

  test("error and warning success", function() {
    const columns = 80;

    const rules = {
      dumb: {
        evaluate({ config }) {
          return config.columns < columns;
        }
      }
    };

    const config = {
      dumb: [
        ["warning", { columns: 80 }],
        ["error", { columns: 100 }]
      ]
    };

    const result = projeclint(rules, config);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "/home/piranna/github/projectlint/projectlint": Object {
          "dumb": Object {
            "dependsOn": undefined,
            "evaluated": Promise {},
          },
        },
      }
    `);

    return expect(getPromises(result)).resolves.toMatchInlineSnapshot(`
      Array [
        Object {
          "failure": undefined,
          "fix": undefined,
          "level": undefined,
          "result": undefined,
        },
      ]
    `);
  });
});
