module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      numberOfRuns: 1,
      url: [
        // Measure one actual home document. Bare / intentionally detects the
        // visitor language and may load RU then EN; that transition is covered
        // by the browser language suite, not counted as two page transfers here.
        "http://localhost/en/",
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
        // Approved multilingual/support/video/consent modules: 25,925 gzip
        // bytes across all 18 assets; measured cold EN wire transfer 32,974.
        // Bound the actual page+HTTP overhead with a small measured margin.
        // Performance/accessibility/BP/SEO category thresholds stay unchanged.
        "resource-summary:script:size": ["error", { maxNumericValue: 35000 }],
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
