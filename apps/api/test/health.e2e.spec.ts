import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { HealthResponseSchema } from "@helpharbor/contracts";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { APP_CONFIG, loadConfig } from "../src/config/env";
import { configureApp } from "../src/configure-app";

describe("GET /api/v1/health (smoke)", () => {
  let app: INestApplication;
  const config = loadConfig({
    NODE_ENV: "test",
    APP_VERSION: "1.2.3-test",
    MONGODB_URI: "mongodb://localhost:27017/helpharbor_test?directConnection=true",
    REDIS_URL: "redis://localhost:6379",
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .compile();
    app = configureApp(moduleRef.createNestApplication(), config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns a payload that satisfies the shared contract", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    const body = HealthResponseSchema.parse(response.body);
    expect(body.version).toBe("1.2.3-test");
    expect(body.environment).toBe("test");
  });

  it("only serves the versioned route", async () => {
    await request(app.getHttpServer()).get("/api/health").expect(404);
    await request(app.getHttpServer()).get("/health").expect(404);
  });

  it("allows the web origin with credentials", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Origin", "http://localhost:3000")
      .expect(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});
