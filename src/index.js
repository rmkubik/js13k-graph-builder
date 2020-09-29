const { argv } = require("yargs")
  .option("zipPath", {
    alias: "path",
    type: "string",
    description: "Path to your zipped build, relative to project root.",
    required: true,
  })
  .option("buildCommand", {
    alias: "cmd",
    type: "string",
    description: "Command to execute to build your zip file.",
    required: true,
  })
  .option("projectDirectory", {
    alias: "dir",
    type: "string",
    description: "Path to your project's root.",
    required: true,
  })
  .option("outputDirectory", {
    alias: "out",
    type: "string",
    description: "Location of output data file.",
    default: process.cwd(),
  })
  .option("commitLimit", {
    alias: "limit",
    type: "number",
    description:
      "How many previous commits to calculate. Use 0 to show all commits.",
    default: 1,
  })
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Should command outputs be sent to terminal.",
    default: false,
  });

const shell = require("shelljs");
const { promisify } = require("util");
const fs = require("fs");
const readline = require("readline");
const writeFile = promisify(fs.writeFile);
const path = require("path");
const chalk = require("chalk");
const { stripIndents } = require("common-tags");
const simpleGit = require("simple-git");
const ora = require("ora");
const spinner = ora();

function promisifyReadlineQuestion(rl) {
  rl.question[promisify.custom] = (question) => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  return promisify(rl.question);
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const readlineAsync = promisifyReadlineQuestion(rl);

  const response = await readlineAsync(question);

  rl.close();

  return response;
}

function execAsync(cmd, opts = {}) {
  return new Promise(function (resolve, reject) {
    // Execute the command, reject if we exit non-zero (i.e. error)
    shell.exec(cmd, opts, function (code, stdout, stderr) {
      if (code != 0) return reject(new Error(stderr));
      return resolve(stdout);
    });
  });
}

async function startSpinner(message) {
  return spinner.start(message);
}

async function endSpinner(success, message) {
  spinner.stopAndPersist({
    symbol: success ? "✅" : "❌",
    text: message,
  });
}

async function buildProject(buildCommand, verbose) {
  // TODO: allow arbitrary array of commands via a config file

  // clean node_modules
  const nodeModulesPath = "node_modules";

  startSpinner(
    stripIndents(chalk`
      {blue {bold Cleaning installation directory}}
      {blue Command: } rm -rf ${nodeModulesPath}
    `)
  );
  if (fs.existsSync(nodeModulesPath)) {
    await execAsync(`rm -rf ${nodeModulesPath}`, { silent: !verbose });
  }
  endSpinner(true, chalk.blue("Cleaned installation directory"));

  // do npm install
  startSpinner(
    stripIndents(chalk`
      {blue {bold Installing dependencies}}
      {blue Command: } npm ci
    `)
  );
  await execAsync("npm ci", { silent: !verbose });
  endSpinner(true, chalk.blue("Installed dependencies"));

  // run build command
  startSpinner(
    stripIndents(chalk`
      {blue {bold Building project}}
      {blue Command: } ${buildCommand}
    `)
  );
  await execAsync(buildCommand, { silent: !verbose });
  endSpinner(true, chalk.blue("Built project"));
}

async function evaluteBuildSize(zipPath) {
  const stats = fs.statSync(zipPath);

  return stats.size;
}

async function getCommitList() {
  if (!shell.which("git")) {
    console.log("Sorry, this script requires git!\n");
    return [];
  }

  const git = simpleGit({
    baseDir: shell.pwd().stdout,
  });

  // TODO: allow specification of commits via a config file
  const commits = await git.log();

  return commits.all.map((commit) => commit.hash);
}

async function checkoutCommit(commit) {
  const git = simpleGit({
    baseDir: shell.pwd().stdout,
  });

  await git.checkout(commit);
}

async function getCurrentCommitInfo() {
  const git = simpleGit({
    baseDir: shell.pwd().stdout,
  });

  const commits = await git.log();

  return commits.latest;
}

async function writeOutput(outputDirectory, output) {
  const outputFilePath = path.join(outputDirectory, "output.json");
  startSpinner(
    stripIndents(chalk`
      {blue {bold Writing output results file}}
      {blue Output file: } ${outputFilePath}
    `)
  );

  await writeFile(outputFilePath, JSON.stringify(output, undefined, 2));

  endSpinner(true, chalk.blue("Wrote output file"));
}

async function promptConfirmation({
  buildCommand,
  buildPath,
  projectDirectory,
  outputPath,
  branchName,
  commits,
}) {
  console.log(
    stripIndents(
      chalk`
        {blue Project directory:} ${projectDirectory}
        {blue Current branch:} ${branchName}
        {blue Found commit count:} ${commits.length}
        {blue Build command:} ${buildCommand}
        {blue Build output zip:} ${buildPath}
        {blue Information output location:} ${outputPath}
      `
    )
  );
  console.log("");

  const response = await prompt(
    chalk`Do you want to proceed? ({green y}/{red N}): `
  );

  if (response.toLowerCase() === "y") {
    console.log(chalk.green("Recieved confirmation. Proceeding!\n"));
    return true;
  }

  console.log(chalk.red("Did not recieve confirmation. Aborting!\n"));
  return false;
}

async function checkoutBranch(branchName) {
  const git = simpleGit({
    baseDir: shell.pwd().stdout,
  });

  await git.checkout(branchName);
}

async function getCurrentBranch() {
  const git = simpleGit({
    baseDir: shell.pwd().stdout,
  });

  return (await git.branch()).current;
}

async function run() {
  const {
    zipPath,
    buildCommand,
    projectDirectory,
    outputDirectory,
    commitLimit,
    verbose,
  } = argv;

  shell.cd(projectDirectory);

  const branchName = await getCurrentBranch();
  const commits = await getCommitList();

  // limit amount of commits used in output
  // commitLimit 0 means show all commits
  if (commitLimit !== 0) {
    commits.splice(commitLimit);
  }

  const confirmation = await promptConfirmation({
    buildCommand,
    buildPath: path.join(projectDirectory, zipPath),
    projectDirectory,
    outputPath: path.join(outputDirectory, "output.json"),
    branchName,
    commits,
  });

  if (!confirmation) {
    return;
  }

  const output = [];

  for (commit of commits) {
    await checkoutCommit(commit);

    await buildProject(buildCommand, verbose);

    const buildSize = await evaluteBuildSize(zipPath);
    const commitInfo = await getCurrentCommitInfo();

    output.push({ ...commitInfo, buildSize });
  }

  await checkoutBranch(branchName);

  await writeOutput(outputDirectory, output);
}

run();
