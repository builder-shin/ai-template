const [command, task] = process.argv.slice(2);
process.stderr.write(`아직 없다: ${command}(계획 Task ${task}에서 구현한다)\n`);
process.exitCode = 1;
