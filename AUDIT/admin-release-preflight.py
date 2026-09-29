"""Read-only effective database identity check; outputs no credentials or PII."""
import os
from pathlib import Path
import subprocess
from dotenv import dotenv_values
from sqlalchemy.engine import make_url
import psycopg

repo = Path('/opt/safr/safr-bali')
pid = subprocess.check_output(['systemctl','show','safr-bali-backend','-p','MainPID','--value'],text=True).strip()
assert pid.isdigit() and int(pid)>1
env = dict(part.split(b'=',1) for part in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0') if b'=' in part)
configured = dotenv_values(repo/'06 Development/backend/.env',interpolate=False)['DATABASE_URL']
effective = env.get(b'DATABASE_URL',configured.encode()).decode()
assert effective == configured, 'Effective database differs from backup mapping'
url = make_url(effective)
assert url.host in ('localhost','127.0.0.1','::1',None)
with psycopg.connect(dbname=url.database,user=url.username,password=url.password,host=url.host,port=url.port or 5432,connect_timeout=10) as conn:
    conn.read_only=True
    row=conn.execute("SELECT current_database(),current_setting('port'),version_num FROM alembic_version").fetchone()
    assert row[2]=='a9c28b017d60', 'Unexpected live schema'
    assert conn.execute("SELECT to_regclass('public.service_expiry_deliveries')").fetchone()[0] is None
    assert conn.execute("SELECT enabled FROM onboarding_state WHERE id=1").fetchone()[0] is False
    assert conn.execute("SELECT count(*) FROM business_setting_versions WHERE entity_type='notification' AND entity_key='service_expiry'").fetchone()[0] == 0
result=subprocess.check_output(['runuser','-u','postgres','--','psql','-h','/var/run/postgresql','-p',str(url.port or 5432),'-d',url.database,'-Atc',"SELECT current_database() || '|' || current_setting('port') || '|' || version_num FROM alembic_version"],text=True).strip()
assert result=='|'.join(row),'Socket mapping differs'
print('PASS: effective runtime/database/socket identity; baseline a9c28b017d60; reminders absent; onboarding OFF')
