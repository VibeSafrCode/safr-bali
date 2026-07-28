module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      numberOfRuns: 1,
      url: [
        "http://localhost/",
        "http://localhost/directions/",
        "http://localhost/directions/bali/",
      ],
      settings: {
        chromeFlags: "--headless --no-sandbox --disable-gpu",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "resource-summary:script:size": ["error", { maxNumericValue: 0 }],
        "resource-summary:stylesheet:size": [
          "error",
          { maxNumericValue: 40000 }
        ]
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci/reports"
    }
  }
};
