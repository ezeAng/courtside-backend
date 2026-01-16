# Courtside SQL Reference

Note: Not all RPCs used by the app are listed here yet.

## RPCs

### approve_club_member

```sql
declare
  v_max_members int;
  v_active_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Ensure caller is admin
  if not exists (
    select 1
    from public.club_memberships
    where club_id = p_club_id
      and user_id = auth.uid()
      and role in ('core_admin', 'admin')
      and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  -- Ensure target membership exists and is requested
  if not exists (
    select 1
    from public.club_memberships
    where club_id = p_club_id
      and user_id = p_user_id
      and status = 'requested'
  ) then
    raise exception 'Membership not in requested state';
  end if;

  -- Enforce max members again
  select max_members
  into v_max_members
  from public.clubs
  where id = p_club_id
    and is_active = true;

  if v_max_members is not null then
    select count(*)
    into v_active_count
    from public.club_memberships
    where club_id = p_club_id
      and status = 'active';

    if v_active_count >= v_max_members then
      raise exception 'Club is full';
    end if;
  end if;

  -- Approve membership
  update public.club_memberships
  set
    status = 'active',
    approved_at = now(),
    approved_by = auth.uid()
  where club_id = p_club_id
    and user_id = p_user_id
    and status = 'requested';
end;
```

### create_club_with_admin

```sql
declare
  v_club_id uuid;
  v_is_premium boolean;
  v_membership_tier text;
begin
  -- Ensure authenticated
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Check premium eligibility
  select is_premium, membership_tier
  into v_is_premium, v_membership_tier
  from public.users
  where auth_id = auth.uid();

  if v_is_premium is distinct from true
     or v_membership_tier is distinct from 'pro' then
    raise exception 'Only premium pro users can create clubs';
  end if;

  -- Create club
  insert into public.clubs (
    name,
    description,
    emblem_url,
    visibility,
    max_members,
    playing_cadence,
    usual_venues,
    contact_info,
    created_by
  ) values (
    p_name,
    p_description,
    p_emblem_url,
    p_visibility,
    p_max_members,
    p_playing_cadence,
    p_usual_venues,
    p_contact_info,
    auth.uid()
  )
  returning id into v_club_id;

  -- Insert creator as core admin
  insert into public.club_memberships (
    club_id,
    user_id,
    role,
    status,
    approved_at,
    approved_by
  ) values (
    v_club_id,
    auth.uid(),
    'core_admin',
    'active',
    now(),
    auth.uid()
  );

  return v_club_id;
end;
```

### request_or_join_club

```sql
declare
  v_visibility text;
  v_max_members int;
  v_active_count int;
  v_membership_id uuid;
  v_membership_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Ensure club exists and is active
  select visibility, max_members
  into v_visibility, v_max_members
  from public.clubs
  where id = p_club_id
    and is_active = true;

  if not found then
    raise exception 'Club not found or inactive';
  end if;

  select id, status
  into v_membership_id, v_membership_status
  from public.club_memberships
  where club_id = p_club_id
    and user_id = auth.uid();

  if found then
    if v_membership_status <> 'left' then
      raise exception 'Already joined or requested';
    end if;

    -- Enforce max members (active only)
    if v_max_members is not null then
      select count(*)
      into v_active_count
      from public.club_memberships
      where club_id = p_club_id
        and status = 'active';

      if v_active_count >= v_max_members then
        raise exception 'Club is full';
      end if;
    end if;

    if v_visibility = 'public' then
      update public.club_memberships
      set status = 'active',
          approved_at = now(),
          approved_by = auth.uid(),
          requested_at = null
      where id = v_membership_id;
      return 'joined';
    else
      update public.club_memberships
      set status = 'requested',
          requested_at = now(),
          approved_at = null,
          approved_by = null
      where id = v_membership_id;
      return 'requested';
    end if;
  end if;

  -- Enforce max members (active only)
  if v_max_members is not null then
    select count(*)
    into v_active_count
    from public.club_memberships
    where club_id = p_club_id
      and status = 'active';

    if v_active_count >= v_max_members then
      raise exception 'Club is full';
    end if;
  end if;

  -- Insert membership
  if v_visibility = 'public' then
    insert into public.club_memberships (
      club_id,
      user_id,
      role,
      status,
      approved_at,
      approved_by
    ) values (
      p_club_id,
      auth.uid(),
      'member',
      'active',
      now(),
      auth.uid()
    );
    return 'joined';
  else
    insert into public.club_memberships (
      club_id,
      user_id,
      role,
      status,
      requested_at
    ) values (
      p_club_id,
      auth.uid(),
      'member',
      'requested',
      now()
    );
    return 'requested';
  end if;
end;
```
