import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
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

// Keep an actual database mutation uncommitted until the Student RPC is observed
// waiting for its row lock. No timing assumption about which transaction wins.
async function checkoutRace(change, restore, expected, requestSuffix) {
  const quoteOutput = await run('psql', ['-X', '-qAt', ...connection, '-v', 'ON_ERROR_STOP=1', '-c', `
    begin;
    select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
    set local role authenticated;
    select jsonb_build_object('items',items,'quote',public.preview_online_order(items))
    from (select jsonb_build_array(jsonb_build_object('menu_item_id',id,'quantity',1)) as items
      from public.menu_items where name='Samosa') chosen;
    commit;`])
  const fixture = JSON.parse(quoteOutput.split(/\r?\n/).find(line => line.startsWith('{')))
  const executable = binDirectory ? join(binDirectory, 'psql' + (process.platform === 'win32' ? '.exe' : '')) : 'psql'
  const locker = spawn(executable, ['-X','-qAt',...connection,'-v','ON_ERROR_STOP=1'], {windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']})
  let output = ''; let errors = ''
  locker.stdout.on('data', chunk => { output += chunk })
  locker.stderr.on('data', chunk => { errors += chunk })
  const closed = new Promise((resolveClose,rejectClose) => {
    locker.on('error',rejectClose)
    locker.on('close',code => code===0?resolveClose():rejectClose(new Error(`Race fixture failed: ${errors}`)))
  })
  locker.stdin.write(`begin; ${change};\n\\echo CHECKOUT_LOCK_READY\n`)
  let attempt
  let observed = false
  try {
    for(let count=0;!output.includes('CHECKOUT_LOCK_READY') && count<100;count++) await new Promise(resolveWait=>setTimeout(resolveWait,50))
    if(!output.includes('CHECKOUT_LOCK_READY')) throw new Error('Mutation lock was not acquired')
    const selection = JSON.stringify(fixture.items).replaceAll("'","''")
    attempt = run('psql', ['-X','-qAt',...connection,'-v','ON_ERROR_STOP=1','-c', `
      set application_name='canteen_phase7_race';
      begin;
      select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
      set local role authenticated;
      select public.place_online_order('73000000-0000-4000-8000-${requestSuffix}', '${selection}'::jsonb, '${fixture.quote.fingerprint}');
      commit;`]).then(()=>({ok:true,error:''}),error=>({ok:false,error:String(error)}))
    for(let count=0;count<50;count++) {
      const waiting = await run('psql', ['-X','-qAt',...connection,'-c', "select count(*) from pg_stat_activity where application_name='canteen_phase7_race' and wait_event_type='Lock';"])
      if(waiting.trim()==='1') {observed=true;break}
      await new Promise(resolveWait=>setTimeout(resolveWait,50))
    }
  } finally {
    locker.stdin.end('commit;\n')
    await closed
  }
  const result = attempt ? await attempt : null
  await run('psql', ['-X',...connection,'-v','ON_ERROR_STOP=1','-c',restore])
  if(!observed || !result || result.ok || !result.error.includes(expected)) throw new Error(`Checkout race did not reject safely: ${expected}`)
  console.log(`PASS controlled concurrent mutation: ${expected} (RPC waited for row lock)`)
}

try {
  console.log(`Isolated local test cluster: ${clusterDirectory}`)
  await run('initdb', ['-D', dataDirectory, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C', '--no-instructions'])
  await run('pg_ctl', ['-D', dataDirectory, '-l', logFile, '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
  await apply(join(testsDirectory, 'local_auth_stub.sql'))
  for (const migration of (await readdir(join(databaseDirectory, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    if (migration === '20261122000100_student_checkout.sql') {
      // Validate the read-only report on the original Phase 4 baseline locally.
      await apply(join(databaseDirectory, 'preflight_phase7.sql'))
    }
    await apply(join(databaseDirectory, 'migrations', migration))
  }
  await apply(join(databaseDirectory, 'seed.sql'))
  await apply(join(databaseDirectory, 'seed.sql'))
  await apply(join(testsDirectory, 'schema_checks.sql'))
  await apply(join(testsDirectory, 'queue_priority_checks.sql'))
  await apply(join(testsDirectory, 'rls_checks.sql'))
  await apply(join(testsDirectory, 'checkout_privileges.sql'))
  await apply(join(testsDirectory, 'checkout_checks.sql'))
  await apply(join(testsDirectory, 'checkout_idempotency.sql'))

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
  await run('psql', ['-X', ...connection, '-v', 'ON_ERROR_STOP=1', '-c', 'update public.canteen_settings set is_open = true;'])
  await run('pgbench', ['-n', ...connection, '-c', '8', '-j', '4', '-t', '5', '-D', 'duplicate_mode=0', '-f', join(testsDirectory, 'checkout_concurrent.sql')])
  await run('pgbench', ['-n', ...connection, '-c', '8', '-j', '4', '-t', '5', '-D', 'duplicate_mode=1', '-f', join(testsDirectory, 'checkout_concurrent.sql')])
  await run('psql', ['-X', ...connection, '-v', 'ON_ERROR_STOP=1', '-c', `
    do $$ begin
      assert (select count(*) from canteen_private.order_requests)=42;
      assert (select count(distinct order_id) from canteen_private.order_requests)=42;
      assert (select count(*) from public.orders o join canteen_private.order_requests r on r.order_id=o.id)=42;
      assert (select count(distinct token) from public.orders o join canteen_private.order_requests r on r.order_id=o.id)=42;
      assert (select count(*) from public.order_items i join canteen_private.order_requests r on r.order_id=i.order_id)=42;
      assert (select count(*) from public.order_status_history h join canteen_private.order_requests r on r.order_id=h.order_id)=42;
      assert not exists(select 1 from public.orders o join canteen_private.order_requests r on r.order_id=o.id
        where o.status<>'placed' or o.accepted_at is not null or o.total_amount<>(select sum(subtotal) from public.order_items where order_id=o.id));
    end $$;`])
  console.log('PASS actual Student RPC: 40 distinct requests plus 40 duplicate calls produce exactly 42 complete, uniquely tokened orders')
  await checkoutRace('update public.canteen_settings set is_open=false', 'update public.canteen_settings set is_open=true', 'CANTEEN_CLOSED', '000000000001')
  await checkoutRace("update public.menu_items set is_available=false where name='Samosa'", "update public.menu_items set is_available=true where name='Samosa'", 'ITEM_UNAVAILABLE', '000000000002')
  await checkoutRace("update public.menu_items set price=25 where name='Samosa'", "update public.menu_items set price=20 where name='Samosa'", 'PRICE_CHANGED', '000000000003')
  await checkoutRace("update public.categories set is_active=false where name='Snacks'", "update public.categories set is_active=true where name='Snacks'", 'ITEM_UNAVAILABLE', '000000000004')
  await checkoutRace("update public.menu_items set category_id=(select id from public.categories where name='Breakfast') where name='Samosa'", "update public.menu_items set category_id=(select id from public.categories where name='Snacks') where name='Samosa'", 'ITEM_UNAVAILABLE', '000000000005')
  await checkoutRace("update public.profiles set role='staff' where id='00000000-0000-0000-0000-000000000001'", "update public.profiles set role='student' where id='00000000-0000-0000-0000-000000000001'", 'STUDENT_REQUIRED', '000000000006')
  await run('psql', ['-X',...connection,'-v','ON_ERROR_STOP=1','-c', `do $$ begin
    assert (select count(*) from canteen_private.order_requests)=42;
    assert (select count(*) from public.orders)=82;
    assert (select count(*) from public.order_items)=82;
    assert (select count(*) from public.order_status_history)=82;
    assert (select sum(last_token_number) from public.daily_token_counters)=82;
  end $$;`])
  console.log('PASS rejected concurrent mutations leave no partial rows or consumed tokens')
  await apply(join(databaseDirectory, 'verify.sql'))
  console.log('Local PostgreSQL checks passed. This run did not contact Supabase.')
} finally {
  if (existsSync(join(dataDirectory, 'postmaster.pid'))) {
    await run('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'])
    console.log('Stopped the isolated local test server.')
  }
  console.log(`Test data and logs are retained in ${clusterDirectory}`)
}
