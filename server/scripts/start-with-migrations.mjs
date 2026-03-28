import { spawn, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const prismaCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function runPrisma(args, { allowFailure = false } = {}) {
  const result = spawnSync(prismaCommand, ['prisma', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if ((result.status ?? 1) !== 0 && !allowFailure) {
    process.exit(result.status ?? 1)
  }

  return result
}

function findInitialMigrationName() {
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations')

  const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  return migrationNames[0] ?? null
}

function run() {
  const deployResult = runPrisma(['migrate', 'deploy'], { allowFailure: true })

  if ((deployResult.status ?? 1) !== 0) {
    const output = `${deployResult.stdout ?? ''}\n${deployResult.stderr ?? ''}`

    if (!output.includes('P3005')) {
      process.exit(deployResult.status ?? 1)
    }

    const baselineMigration = findInitialMigrationName()

    if (!baselineMigration) {
      console.error('Failed to baseline: no Prisma migrations found')
      process.exit(1)
    }

    console.log(
      `Detected P3005 (non-empty schema). Marking '${baselineMigration}' as applied, then retrying deploy.`,
    )

    runPrisma(['migrate', 'resolve', '--applied', baselineMigration])
    runPrisma(['migrate', 'deploy'])
  }

  const devProcess = spawn(npmCommand, ['run', 'dev'], {
    stdio: 'inherit',
  })

  devProcess.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}

run()
