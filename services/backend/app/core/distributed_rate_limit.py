"""Fixed-state, all-or-nothing admission using the coordination Redis primary."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac

from app.config import settings
from app.redis import coordination_client


@dataclass(frozen=True)
class Budget:
    key: str
    capacity: int
    window_seconds: int
    burst: int | None = None
    fixed: bool = False

    def __post_init__(self):
        if not self.key or len(self.key) > 300:
            raise ValueError("Invalid budget key")
        if type(self.capacity) is not int or type(self.window_seconds) is not int or not 1 <= self.capacity <= 10_000_000 or not 1 <= self.window_seconds <= 86400:
            raise ValueError("Invalid rate policy")
        if self.burst is not None and (type(self.burst) is not int or not 1 <= self.burst <= self.capacity):
            raise ValueError("Invalid burst")


@dataclass(frozen=True)
class Admission:
    allowed: bool
    retry_after: int
    remaining: int


def identity_key(value: str) -> str:
    return hmac.new(settings.JWT_SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


# At most six keys, O(k) work and O(1) state/key. Check every bucket before
# writing any: rejected requests do not partially consume an admitted budget.
ADMIT_LUA = """
local clock = redis.call('TIME')
local now = tonumber(clock[1]) + tonumber(clock[2]) / 1000000
local states = {}
local wait = 0
local remaining = 10000000
for i,key in ipairs(KEYS) do
  local base = (i-1)*4
  local cap = tonumber(ARGV[base+1])
  local window = tonumber(ARGV[base+2])
  local burst = tonumber(ARGV[base+3])
  local fixed = tonumber(ARGV[base+4])
  local state = redis.call('HMGET', key, 'value', 'at')
  local value = tonumber(state[1])
  local at = tonumber(state[2]) or now
  if fixed == 1 then
    local epoch = math.floor(now/window)
    if value == nil or at ~= epoch then value = 0 end
    if value >= cap then wait = math.max(wait, (epoch+1)*window-now) end
    remaining = math.min(remaining, math.max(0, cap-value-1))
    states[i] = {value+1, epoch, window+1}
  else
    if value == nil then value = burst end
    value = math.min(burst, value + math.max(0, now-at)*cap/window)
    if value < 1 then wait = math.max(wait, (1-value)*window/cap) end
    remaining = math.min(remaining, math.max(0, math.floor(value-1)))
    states[i] = {value-1, now, math.ceil(burst*window/cap)+1}
  end
end
if wait > 0 then return {0, math.ceil(wait), 0} end
for i,key in ipairs(KEYS) do
  local state = states[i]
  redis.call('HSET', key, 'value', state[1], 'at', state[2])
  redis.call('EXPIRE', key, state[3])
end
return {1, 0, remaining}
"""


async def admit(budgets: list[Budget], client=None) -> Admission:
    if not 1 <= len(budgets) <= 6 or len({b.key for b in budgets}) != len(budgets):
        raise ValueError("Admission requires one to six distinct budgets")
    args: list[int] = []
    for budget in budgets:
        args.extend([budget.capacity, budget.window_seconds, budget.burst or budget.capacity, int(budget.fixed)])
    result = await (client or coordination_client).eval(ADMIT_LUA, len(budgets), *[b.key for b in budgets], *args)
    return Admission(bool(result[0]), int(result[1]), int(result[2]))
