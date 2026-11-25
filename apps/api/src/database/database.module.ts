import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { MongoClient, type Db } from "mongodb";
import { APP_CONFIG, type AppConfig } from "../config/env";

export const MONGO_CLIENT = Symbol("MONGO_CLIENT");
export const MONGO_DB = Symbol("MONGO_DB");

/**
 * One MongoClient per process. The driver connects lazily on the first
 * operation, so routes that never touch the database (health) work without it.
 */
@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000, appName: "helpharbor-api" }),
    },
    {
      provide: MONGO_DB,
      inject: [MONGO_CLIENT],
      // Uses the database named in the URI path.
      useFactory: (client: MongoClient): Db => client.db(),
    },
  ],
  exports: [MONGO_CLIENT, MONGO_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
