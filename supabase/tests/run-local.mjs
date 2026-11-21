import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDirectory = dirname(fileURLToPath(import.meta.url))
const databaseDirectory = resolve(testsDirectory, '..')
const binDirectory = process.env.POSTGRES_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '')
const port = process.env.CANTEEN_TEST_PORT ?? '6543'
const clusterDirectory = await mkdtemp(join(tmpdir(), 'college-canteen-phase4-'))
const dataDirectory = join(clusterDirectory, 'data')
const logFile = join(clusterDirectory, 'postgres.log')

// Argument arrays avoid shell quoting problems when Windows paths contain spaces.
function run(program, args) {
  const executable = binDirectory ? join(binDirectory, program + (process.platform === 'win32' ? '.exe' : '')) : program
  return new Promise((resolveRun, rejectRun) => {
    // pg_ctl starts a background server. Inherited pipes can stay open on Windows.
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: program === 'pg_ctl' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (chunk) => { output += chunk })
    child.stderr?.on('data', (chunk) => { output += chunk })
    child.on('error', rejectRun)
    child.on('close', (code) => {
      if (code === 0) resolveRun(output)
      else rejectRun(new Error(`${program} failed with exit code ${code}\n${output}`))
    })
  })
}

const connection = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres']
async function apply(file) {
  await run('psql', ['-X', ...connection, '-v', 'ON_ERROR_STOP=1', '-f', file])
  console.log(`PASS ${file.substring(databaseDirectory.length + 1)}`)
}

try {
  console.log(`Isolated local test cluster: ${clusterDirectory}`)
  await run('initdb', ['-D', dataDirectory, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C', '--no-instructions'])
  await run('pg_ctl', ['-D', dataDirectory, '-l', logFile, '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
  await apply(join(testsDirectory, 'local_auth_stub.sql'))
  await apply(join(databaseDirectory, 'migrations', '20261119000100_initial_schema.sql'))
  await apply(join(databaseDirectory, 'seed.sql'))
  await apply(join(databaseDirectory, 'seed.sql'))
  await apply(join(testsDirectory, 'schema_checks.sql'))
  await apply(join(testsDirectory, 'queue_priority_checks.sql'))
  await apply(join(testsDirectory, 'rls_checks.sql'))

  await run('psql', ['-X', ...connection, '-v', 'ON_ERROR_STOP=1', '-c',
    "update public.menu_items set price = 47.50, is_available = false where name = 'Veg Sandwich'; update public.categories set is_active = false where name = 'Breakfast';"])
  await apply(join(databaseDirectory, 'seed.sql'))
  await run('psql', ['-X', ...connection, '-v', 'ON_ERROR_STOP=1', '-c', `
    do $$ begin
      assert (select count(*) from public.menu_items) = 8;
      assert (select count(*) from public.categories) = 5;
      assert (select price from public.menu_items where name = 'Veg Sandwich') = 47.50;
      assert not (select is_available from public.menu_items where name = 'Veg Sandwich');
      assert not (select is_active from public.categories where name = 'Breakfast');
    end $$;`])
  console.log('PASS repeatable seed preserves edited prices, availability, and archived categories')

  await run('pgbench', ['-n', ...connection, '-c', '8', '-j', '4', '-t', '5', '-f', join(testsDirectory, 'concurrent_orders.sql')])
  await run('psql', ['-X', ...connection, '-v', 'ON_ERROR_STOP=1', '-c', `
    do $$ begin
      assert (select count(*) from public.orders where business_date = date '2099-12-31') = 40;
      assert (select count(distinct token) from public.orders where business_date = date '2099-12-31') = 40;
      assert (select count(distinct token_number) from public.orders where business_date = date '2099-12-31') = 40;
      assert (select count(*) from public.orders where business_date = date '2099-12-31' and order_type = 'online') = 20;
      assert (select count(*) from public.orders where business_date = date '2099-12-31' and order_type = 'walk_in') = 20;
      assert (select last_token_number from public.daily_token_counters where business_date = date '2099-12-31') = 40;
      assert (select count(*) from public.order_items) = 40;
    end $$;`])
  console.log('PASS 20 online and 20 walk-in fixture orders across 8 concurrent clients have 40 unique tokens')
  await apply(join(databaseDirectory, 'verify.sql'))
  console.log('Local PostgreSQL checks passed. This run did not contact Supabase.')
} finally {
  if (existsSync(join(dataDirectory, 'postmaster.pid'))) {
    await run('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'])
    console.log('Stopped the isolated local test server.')
  }
  console.log(`Test data and logs are retained in ${clusterDirectory}`)
}
