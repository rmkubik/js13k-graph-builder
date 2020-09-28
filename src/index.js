const {
    argv
} = require("yargs")
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
    });

require("intl");

const shell = require("shelljs");
const fs = require("fs");
const path = require("path");
// const {
//     stripIndents
// } = require("common-tags");

async function buildProject(buildCommand) {
    // clean node_modules
    const nodeModulesPath = 'node_modules';

    if (fs.existsSync(nodeModulesPath)) {
        shell.rm("-rf", nodeModulesPath);
    }

    // do npm install
    shell.exec("npm install");

    // run build command
    shell.exec(buildCommand);
}

async function evaluteBuildSize(zipPath) {
    const stats = fs.statSync(zipPath);

    return stats.size;
}

async function run() {
    const {
        zipPath,
        buildCommand,
        projectDirectory
    } = argv;

    shell.cd(projectDirectory);

    await buildProject(buildCommand);

    const buildSize = await evaluteBuildSize(zipPath);
    console.log(buildSize);
}

run();