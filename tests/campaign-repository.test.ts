import test from "node:test";

import {
  createMemoryCampaignRecordStore, createStoreCampaignRepositories
} from "../src/campaign/campaign-store-repository.ts";
import { runCampaignRepositoryContract } from "./campaign-repository-contract.ts";

test("the store-backed campaign repository keeps the shared repository contract over the memory store", async () => {
  let clock = 1_000;
  await runCampaignRepositoryContract(
    createStoreCampaignRepositories(createMemoryCampaignRecordStore(), () => ++clock), "memory");
});
