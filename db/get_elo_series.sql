create or replace function get_elo_series(
  p_auth_id uuid,
  p_elo_type text,
  p_tz text default 'UTC'
)
returns jsonb
language sql
stable
as $$
with series as (
  select
    eh.created_at at time zone p_tz as ts,
    case
      when p_elo_type = 'overall' then eh.new_overall_elo
      else eh.new_elo
    end as elo
  from elo_history eh
  where
    eh.auth_id = p_auth_id
    and (
      p_elo_type = 'overall'
      or eh.discipline = p_elo_type
    )
    and (
      case
        when p_elo_type = 'overall' then eh.new_overall_elo
        else eh.new_elo
      end
    ) is not null
  order by eh.created_at asc
)

select jsonb_build_object(
  'elo_type', p_elo_type,
  'points',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          't', ts,
          'elo', elo
        )
        order by ts
      ),
      '[]'::jsonb
    )
)
from series;
$$;
