const path = require("path");
const { promisify } = require("util");
const fs = require("fs");
const readFile = promisify(fs.readFile);
const cheerio = require("cheerio");

async function readTemplateFile() {
  const reportFilePath = path.join(__dirname, "./report/index.html");

  return await readFile(reportFilePath, "utf8");
}

function loadParser(fileContents) {
  return cheerio.load(fileContents);
}

async function generateReportFileContents(reportData) {
  const templateFileContents = await readTemplateFile();
  const parser = loadParser(templateFileContents);

  parser("body").prepend(
    `<script>var COMMIT_DATA = JSON.parse(\`${JSON.stringify(
      reportData
    )}\`);</script>`
  );

  return parser.html();
}

module.exports = generateReportFileContents;
