// Metadata used by Storage migrations; binary transfer is covered by real HTTP.
export async function prepareStorage(db) {
  await db.exec(`
    create schema storage;
    create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects,storage.buckets to anon;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
  `);
}
