#!/bin/bash

echo "Testing adjudication server API..."

# Check if server is running
echo -e "\n1. Testing health check endpoint:"
curl -s -X GET http://localhost:3000/health | jq .

echo -e "\n2. Testing intent adjudication with valid request:"
curl -s -X POST http://localhost:3000/intent/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "player_state": {
      "id": "p1",
      "attrs": {
        "str": 32,
        "int": 68,
        "cha": 55,
        "luck": 46
      },
      "legend": 10,
      "tags": ["civilian"]
    },
    "world_state": {
      "era": "184",
      "region": "yingchuan",
      "flags": ["taipingdao_spread=high"]
    },
    "npc_state": [
      {
        "id": "npc_xianwei",
        "stance": "court",
        "trust": 40
      }
    ],
    "event_context": {
      "event_id": "yc_illness_001",
      "scene": "village",
      "rumors": "..."
    },
    "player_intent": "我想结交当地豪强"
  }' | jq .

echo -e "\n3. Testing intent adjudication with missing player_intent (should return 400):"
curl -s -X POST http://localhost:3000/intent/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "player_state": {"id": "p1"},
    "world_state": {"era": "184"}
  }' | jq .

echo -e "\n4. Testing with different intents:"

intents=(
  "我想招募几个士兵"
  "我想去洛阳看看"
  "我想造反自立"
  "我想学习武艺"
)

for intent in "${intents[@]}"; do
  echo -e "\nIntent: '$intent'"
  curl -s -X POST http://localhost:3000/intent/resolve \
    -H "Content-Type: application/json" \
    -d "{
      \"player_intent\": \"$intent\"
    }" | jq '.impact_level, .result.narrative' | tr '\n' ' '
  echo
done

echo -e "\nTest completed."