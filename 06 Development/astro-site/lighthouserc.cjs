module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      numberOfRuns: 1,
      url: [
        "http://localhost/",
        "http://localhost/bali/",
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
        // Ten fingerprinted scripts now include the approved workspace interactions.
        // 17.2 KB measured transfer includes HTTP overhead; categories stay unchanged.
        "resource-summary:script:size": ["error", { maxNumericValue: 20000 }],
        "resource-summary:stylesheet:size": [
          "error",
          { maxNumericValue: 50000 }
        ]
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci/reports"
    }
  }
};
