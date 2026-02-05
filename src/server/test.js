const app = require('./index');
const request = require('supertest');

describe('Adjudication Server', () => {
  test('Health check endpoint', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('Intent adjudication endpoint - valid request', async () => {
    const requestBody = {
      player_state: {
        id: "p1",
        attrs: { str: 32, int: 68, cha: 55, luck: 46 },
        legend: 10,
        tags: ["civilian"]
      },
      world_state: {
        era: "184",
        region: "yingchuan",
        flags: ["taipingdao_spread=high"]
      },
      npc_state: [
        { id: "npc_xianwei", stance: "court", trust: 40 }
      ],
      event_context: {
        event_id: "yc_illness_001",
        scene: "village",
        rumors: "..."
      },
      player_intent: "我想结交当地豪强"
    };

    const response = await request(app)
      .post('/intent/resolve')
      .send(requestBody);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('impact_level');
    expect(['global', 'branch', 'minor']).toContain(response.body.impact_level);
    expect(response.body).toHaveProperty('intent_summary');
    expect(response.body).toHaveProperty('success_prob');
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('success');
    expect(response.body.result).toHaveProperty('narrative');
    expect(response.body).toHaveProperty('state_changes');
  });

  test('Intent adjudication endpoint - missing player_intent', async () => {
    const requestBody = {
      player_state: { id: "p1" },
      world_state: { era: "184" }
      // player_intent is missing
    };

    const response = await request(app)
      .post('/intent/resolve')
      .send(requestBody);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
});