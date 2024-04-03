/**
 * Copyright 2013-2019  GenieACS Inc.
 *
 * This file is part of GenieACS.
 *
 * GenieACS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * GenieACS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with GenieACS.  If not, see <http://www.gnu.org/licenses/>.
 */

import { PassThrough } from "stream";
import Router from "koa-router";
import * as db from "./db";
import * as apiFunctions from "./api-functions";
import { evaluate, and, extractParams } from "../common/expression";
import { parse } from "../common/expression-parser";
import * as logger from "../logger";
import { getConfig } from "../local-cache";
import { QueryOptions, Expression } from "../types";
import { generateSalt, hashPassword } from "../auth";
import { del } from "../cache";
import Authorizer from "../common/authorizer";
import { ping } from "../ping";
import { decodeTag } from "../common";
import { stringify as yamlStringify } from "../common/yaml";
const util = require("util");

const router = new Router();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { v4: uuidv4 } = require("uuid");
export default router;

function logUnauthorizedWarning(log): void {
  log.message += " not authorized";
  logger.accessWarn(log);
}

const RESOURCE_DELETE = 1 << 0;
const RESOURCE_PUT = 1 << 1;

const RESOURCE_IDS = {
  devices: "DeviceID.ID",
  presets: "_id",
  provisions: "_id",
  files: "_id",
  virtualParameters: "_id",
  config: "_id",
  permissions: "_id",
  users: "_id",
  faults: "_id",
  tasks: "_id",
  logs: "_id",
  alerts: "deviceId",
};

const resources = {
  devices: 0 | RESOURCE_DELETE,
  presets: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  provisions: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  files: 0 | RESOURCE_DELETE,
  virtualParameters: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  config: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  permissions: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  users: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  faults: 0 | RESOURCE_DELETE,
  tasks: 0,
  devicelogs: 0,
  logs: 0 | RESOURCE_DELETE | RESOURCE_PUT,
  alerts: 0 | RESOURCE_DELETE,
};

function singleParam(p: string | string[]): string {
  return Array.isArray(p) ? p[p.length - 1] : p;
}

router.get(`/devices/:id.csv`, async (ctx) => {
  const authorizer: Authorizer = ctx.state.authorizer;
  const log = {
    message: "Query device (CSV)",
    context: ctx,
    id: ctx.params.id,
  };

  const filter = and(authorizer.getFilter("devices", 2), [
    "=",
    ["PARAM", RESOURCE_IDS.devices],
    ctx.params.id,
  ]);

  if (!authorizer.hasAccess("devices", 2)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }

  const res = await db.query("devices", filter);
  if (!res[0]) return void (ctx.status = 404);

  ctx.type = "text/csv";
  ctx.attachment(
    `device-${ctx.params.id}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "")}.csv`
  );

  ctx.body = new PassThrough();
  ctx.body.write(
    "Parameter,Object,Object timestamp,Writable,Writable timestamp,Value,Value type,Value timestamp,Notification,Notification timestamp,Access list,Access list timestamp\n"
  );

  for (const k of Object.keys(res[0]).sort()) {
    const p = res[0][k];
    let value = "";
    let type = "";
    if (p.value) {
      value = p.value[0];
      type = p.value[1];
      if (type === "xsd:dateTime" && typeof value === "number")
        value = new Date(value).toJSON();
    }

    const row = [
      k,
      p.object,
      new Date(p.objectTimestamp).toJSON(),
      p.writable,
      new Date(p.writableTimestamp).toJSON(),
      `"${String(value).replace(/"/g, '""')}"`,
      type,
      new Date(p.valueTimestamp).toJSON(),
      p.notification,
      new Date(p.notificationTimestamp).toJSON(),
      p.accessList ? p.accessList.join(", ") : "",
      new Date(p.accessListTimestamp).toJSON(),
    ];
    ctx.body.write(row.map((r) => (r != null ? r : "")).join(",") + "\n");
  }
  ctx.body.end();
  logger.accessInfo(log);
});

for (const [resource, flags] of Object.entries(resources)) {
  router.head(`/${resource}`, async (ctx) => {
    const authorizer: Authorizer = ctx.state.authorizer;
    let filter: Expression = authorizer.getFilter(resource, 1);
    if (ctx.request.query.filter)
      filter = and(filter, parse(singleParam(ctx.request.query.filter)));

    const log = {
      message: `Count ${resource}`,
      context: ctx,
      filter: ctx.request.query.filter,
      count: null,
    };

    if (!authorizer.hasAccess(resource, 1)) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }

    // Exclude temporary tasks and faults
    if (resource === "tasks" || resource === "faults") {
      filter = and(filter, [
        "OR",
        [">=", ["PARAM", "expiry"], Date.now() + 60000],
        ["IS NULL", ["PARAM", "expiry"]],
      ]);
    }

    const count = await db.count(resource, filter);
    ctx.set("X-Total-Count", `${count}`);
    ctx.body = "";
    log.count = count;
    logger.accessInfo(log);
  });

  router.get(`/${resource}`, async (ctx) => {
    const authorizer: Authorizer = ctx.state.authorizer;
    const options: QueryOptions = {};
    let filter: Expression = authorizer.getFilter(resource, 2);
    if (ctx.request.query.filter) {
      console.log(ctx.request.query.filter);
      filter = and(filter, parse(singleParam(ctx.request.query.filter)));
    }
    if (ctx.request.query.limit) options.limit = +ctx.request.query.limit;
    if (ctx.request.query.skip) options.skip = +ctx.request.query.skip;
    if (ctx.request.query.sort)
      options.sort = JSON.parse(singleParam(ctx.request.query.sort));
    if (ctx.request.query.projection) {
      options.projection = singleParam(ctx.request.query.projection)
        .split(",")
        .reduce((obj, k) => Object.assign(obj, { [k]: 1 }), {});
    }

    const log = {
      message: `Query ${resource}`,
      context: ctx,
      filter: ctx.request.query.filter,
      limit: options.limit,
      skip: options.skip,
      sort: options.sort,
      projection: options.projection,
    };

    if (!authorizer.hasAccess(resource, 2)) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }

    // Exclude temporary tasks and faults
    if (resource === "tasks" || resource === "faults") {
      filter = and(filter, [
        "OR",
        [">=", ["PARAM", "expiry"], Date.now() + 60000],
        ["IS NULL", ["PARAM", "expiry"]],
      ]);
    }
    // console.log("rawQuery", ctx.request.query.rawQuery)
    // console.log("typeOfQuery", typeof ctx.request.query.rawQuery)
    // if (typeof ctx.request.query.rawQuery !== "undefined")
    //   filter = ctx.request.query.rawQuery

    ctx.body = new PassThrough();
    ctx.type = "application/json";

    let c = 0;
    ctx.body.write("[\n");
    const count = await db.count(resource, filter);
    console.log("Count Records", count);
    ctx.set("X-Total-Count", `${count}`);

    db.query(resource, filter, options, (obj) => {
      ctx.body.write((c++ ? "," : "") + JSON.stringify(obj) + "\n");
    })
      .then(() => {
        ctx.body.end("]");
        logger.accessInfo(log);
      })
      .catch((err) => {
        ctx.body.emit("error", err);
      });
  });

  // CSV download
  router.get(`/${resource}.csv`, async (ctx) => {
    const authorizer: Authorizer = ctx.state.authorizer;
    const options: QueryOptions = { projection: {} };
    let filter: Expression = authorizer.getFilter(resource, 2);
    if (ctx.request.query.filter)
      filter = and(filter, parse(singleParam(ctx.request.query.filter)));
    if (ctx.request.query.limit) options.limit = +ctx.request.query.limit;
    if (ctx.request.query.skip) options.skip = +ctx.request.query.skip;
    if (ctx.request.query.sort)
      options.sort = JSON.parse(singleParam(ctx.request.query.sort));

    const log = {
      message: `Query ${resource} (CSV)`,
      context: ctx,
      filter: ctx.request.query.filter,
      limit: options.limit,
      skip: options.skip,
      sort: options.sort,
    };

    if (!authorizer.hasAccess(resource, 2)) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }

    const columns: Record<string, Expression> = JSON.parse(
      singleParam(ctx.request.query.columns)
    );
    const now = Date.now();

    for (const [k, v] of Object.entries(columns)) {
      const e = evaluate(parse(v as string), null, now);
      columns[k] = e;
      for (const p of extractParams(e))
        if (typeof p === "string") options.projection[p] = 1;
    }

    // Exclude temporary tasks and faults
    if (resource === "tasks" || resource === "faults") {
      filter = and(filter, [
        "OR",
        [">=", ["PARAM", "expiry"], Date.now() + 60000],
        ["IS NULL", ["PARAM", "expiry"]],
      ]);
    }

    ctx.body = new PassThrough();
    ctx.type = "text/csv";
    ctx.attachment(
      `${resource}-${new Date(now).toISOString().replace(/[:.]/g, "")}.csv`
    );

    ctx.body.write(
      Object.keys(columns).map((k) => `"${k.replace(/"/, '""')}"`) + "\n"
    );
    db.query(resource, filter, options, (obj) => {
      const arr = Object.values(columns).map((exp) => {
        const v = evaluate(exp, obj, null, (e) => {
          if (Array.isArray(e)) {
            if (e[0] === "PARAM") {
              if (resource === "devices") {
                if (e[1] === "Tags") {
                  const tags = [];
                  for (const p in obj)
                    if (p.startsWith("Tags.")) tags.push(decodeTag(p.slice(5)));

                  return tags.join(", ");
                }
                if (e === exp) {
                  const p = obj[e[1]];
                  if (
                    p &&
                    p.value &&
                    p.value[1] === "xsd:dateTime" &&
                    typeof p.value[0] === "number"
                  )
                    return new Date(p.value[0]).toJSON();
                }
              } else if (resource === "faults") {
                if (e[1] === "detail") return yamlStringify(obj["detail"]);
              }
            } else if (e[0] === "FUNC") {
              if (e[1] === "DATE_STRING") {
                if (e[2] && !Array.isArray(e[2]))
                  return new Date(e[2]).toJSON();
              }
            }
          }

          return e;
        });

        if (Array.isArray(v) || v == null) return "";
        if (typeof v === "string") return `"${v.replace(/"/g, '""')}"`;
        return v;
      });
      ctx.body.write(arr.join(",") + "\n");
    })
      .then(() => {
        ctx.body.end();
        logger.accessInfo(log);
      })
      .catch((err) => {
        ctx.body.emit("error", err);
      });
  });

  router.head(`/${resource}/:id`, async (ctx) => {
    const authorizer: Authorizer = ctx.state.authorizer;
    const log = {
      message: `Count ${resource}`,
      context: ctx,
      filter: `${RESOURCE_IDS[resource]} = "${ctx.params.id}"`,
    };

    const filter = and(authorizer.getFilter(resource, 2), [
      "=",
      ["PARAM", RESOURCE_IDS[resource]],
      ctx.params.id,
    ]);
    if (!authorizer.hasAccess(resource, 2)) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }

    const res = await db.query(resource, filter);

    if (!res.length) return void (ctx.status = 404);

    logger.accessInfo(log);
    ctx.body = "";
  });

  router.get(`/${resource}/:id`, async (ctx) => {
    const authorizer: Authorizer = ctx.state.authorizer;
    const log = {
      message: `Query ${resource}`,
      context: ctx,
      filter: `${RESOURCE_IDS[resource]} = "${ctx.params.id}"`,
    };

    const filter = and(authorizer.getFilter(resource, 2), [
      "=",
      ["PARAM", RESOURCE_IDS[resource]],
      ctx.params.id,
    ]);
    if (!authorizer.hasAccess(resource, 2)) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }

    const res = await db.query(resource, filter);

    if (!res.length) return void (ctx.status = 404);

    logger.accessInfo(log);
    ctx.body = res[0];
  });

  console.log(flags);
  if (flags & RESOURCE_DELETE) {
    router.delete(`/${resource}/:id`, async (ctx) => {
      const authorizer: Authorizer = ctx.state.authorizer;
      const log = {
        message: `Delete ${resource}`,
        context: ctx,
        id: ctx.params.id,
      };

      const filter = and(authorizer.getFilter(resource, 3), [
        "=",
        ["PARAM", RESOURCE_IDS[resource]],
        ctx.params.id,
      ]);
      if (!authorizer.hasAccess(resource, 3)) {
        logUnauthorizedWarning(log);
        return void (ctx.status = 403);
      }
      console.log("filter delete", filter);
      const res = await db.query(resource, filter);
      console.log("filter res", res);
      if (!res.length) return void (ctx.status = 404);

      const validate = authorizer.getValidator(resource, res[0]);
      if (!validate("delete")) {
        logUnauthorizedWarning(log);
        return void (ctx.status = 403);
      }

      await apiFunctions.deleteResource(resource, ctx.params.id);
      if (resource !== "logs") {
        if (resource !== "devices") {
          await apiFunctions.postLogs(
            uuidv4(),
            resource,
            "system",
            "delete",
            {
              action:
                "Delete resource " +
                resource +
                " with resource id: " +
                ctx.params.id,
              type: resource,
            },
            null,
            ctx.state.user.username,
            null
          );
        } else {
          await apiFunctions.postLogs(
            uuidv4(),
            resource,
            "system",
            "delete",
            {
              action:
                "Delete " + resource + " with device id: " + ctx.params.id,
              type: resource,
            },
            null,
            ctx.state.user.username,
            null
          );
        }
      }
      logger.accessInfo(log);

      ctx.body = "";
    });
  }

  if (flags & RESOURCE_PUT) {
    router.put(`/${resource}/:id`, async (ctx) => {
      const authorizer: Authorizer = ctx.state.authorizer;
      const id = ctx.params.id;

      const log = {
        message: `Put ${resource}`,
        context: ctx,
        id: id,
      };

      if (!authorizer.hasAccess(resource, 3)) {
        logUnauthorizedWarning(log);
        return void (ctx.status = 403);
      }

      const obj = ctx.request.body;

      const validate = authorizer.getValidator(resource, obj);
      if (!validate("put")) {
        logUnauthorizedWarning(log);
        return void (ctx.status = 403);
      }

      try {
        await apiFunctions.putResource(resource, id, obj);
        if (resource === "virtualParameters") {
          await apiFunctions.postLogs(
            uuidv4(),
            "virtualParameters",
            "system",
            "write",
            {
              action: "Edit Virtual Parameters: " + id,
              type: "virtualParameters",
            },
            null,
            ctx.state.user.username,
            null
          );
        }
      } catch (err) {
        log.message += " failed";
        logger.accessWarn(log);
        ctx.body = `${err.name}: ${err.message}`;
        return void (ctx.status = 400);
      }

      logger.accessInfo(log);

      ctx.body = "";
    });
  }
}

router.get("/blob/files/:id", async (ctx) => {
  const authorizer: Authorizer = ctx.state.authorizer;
  const resource = "files";
  const id = ctx.params.id;

  const log = {
    message: `Download ${resource}`,
    context: ctx,
    id: id,
  };

  const filter = and(authorizer.getFilter(resource, 2), [
    "=",
    ["PARAM", RESOURCE_IDS[resource]],
    ctx.params.id,
  ]);

  if (!authorizer.hasAccess(resource, 2)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }

  const count = await db.count(resource, filter);
  if (!count) return void (ctx.status = 404);

  logger.accessInfo(log);
  ctx.body = db.downloadFile(id);
  ctx.attachment(id);
});

router.put("/files/:id", async (ctx) => {
  const authorizer: Authorizer = ctx.state.authorizer;
  const resource = "files";
  const id = ctx.params.id;

  const log = {
    message: `Upload ${resource}`,
    context: ctx,
    id: id,
    metadata: null,
  };

  if (!authorizer.hasAccess(resource, 3)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }

  const metadata = {
    fileType: singleParam(ctx.request.headers["metadata-filetype"]) || "",
    oui: singleParam(ctx.request.headers["metadata-oui"]) || "",
    productClass:
      singleParam(ctx.request.headers["metadata-productclass"]) || "",
    version: singleParam(ctx.request.headers["metadata-version"]) || "",
  };

  const validate = authorizer.getValidator(resource, metadata);
  if (!validate("put")) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }

  try {
    await db.deleteFile(id);
  } catch (err) {
    // File doesn't exist, ignore
  }

  await db.putFile(id, metadata, ctx.req);
  log.metadata = metadata;
  logger.accessInfo(log);

  ctx.body = "";
});

router.post("/devices/:id/tasks", async (ctx) => {
  const authorizer: Authorizer = ctx.state.authorizer;
  const log = {
    message: "Commit tasks",
    context: ctx,
    deviceId: ctx.params.id,
    tasks: null,
  };

  console.log("authorizer", authorizer);

  const filter = and(authorizer.getFilter("devices", 3), [
    "=",
    ["PARAM", "DeviceID.ID"],
    ctx.params.id,
  ]);
  if (!authorizer.hasAccess("devices", 3)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }
  console.log("ctx.params.id", ctx.params.id);
  console.log("filterfilter", filter);

  const devices = await db.query("devices", filter);
  if (!devices.length) return void (ctx.status = 404);
  const device = devices[0];

  const validate = authorizer.getValidator("devices", device);
  for (const t of ctx.request.body) {
    if (!validate("task", t)) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }
  }

  const onlineThreshold = getConfig(
    ctx.state.configSnapshot,
    "cwmp.deviceOnlineThreshold",
    {},
    Date.now(),
    (exp) => {
      if (!Array.isArray(exp)) return exp;
      if (exp[0] === "PARAM") {
        const p = device[exp[1]];
        if (p?.value) return p.value[0];
      } else if (exp[0] === "FUNC") {
        if (exp[1] === "REMOTE_ADDRESS") {
          for (const root of ["InternetGatewayDevice", "Device"]) {
            const p = device[`${root}.ManagementServer.ConnectionRequestURL`];
            if (p?.value) return new URL(p.value[0]).hostname;
          }
          return null;
        }
      }
      return exp;
    }
  ) as number;

  const socketTimeout: number = ctx.socket["timeout"];

  // Disable socket timeout while waiting for postTasks()
  if (socketTimeout) ctx.socket.setTimeout(0);

  //get current user
  const res = await apiFunctions.postTasks(
    ctx.params.id,
    ctx.request.body,
    onlineThreshold,
    device
  );
  if (res.connectionRequest === "OK") {
    res.tasks.forEach((task) => {
      if (task.status === "fault") {
        console.log(task.fault);
        void apiFunctions.postLogs(
          uuidv4(),
          "devices",
          "device",
          "write",
          null,
          task,
          ctx.state.user.username,
          device
        );
      } else if (task.status === "done") {
        void apiFunctions.postLogs(
          uuidv4(),
          "devices",
          "device",
          "write",
          null,
          task,
          ctx.state.user.username,
          device
        );
      }
    });
  }

  // Restore socket timeout
  if (socketTimeout) ctx.socket.setTimeout(socketTimeout);

  log.tasks = res.tasks.map((t) => t._id).join(",");

  logger.accessInfo(log);

  ctx.set("Connection-Request", res.connectionRequest);
  ctx.body = res.tasks;
});

router.post("/devices/createSchedule", async (ctx) => {
  try {
    const bodyData = ctx.request.body;
    const scheduleTime = bodyData.scheduleTime;
    const scheduleDate = new Date(scheduleTime);

    if (isNaN(scheduleDate.getTime())) {
      ctx.status = 400;
      ctx.body = {
        error: "Invalid schedule time format. Please provide a valid date.",
      };
      return;
    }
    const currentDate = new Date();
    if (scheduleDate <= currentDate) {
      ctx.status = 400;
      ctx.body = { error: "Invalid: Schedule time must be in the future." };
      return;
    }

    // Round schedule time to the nearest 5 minutes
    const roundedMinutes = Math.ceil(scheduleDate.getMinutes() / 5) * 5;
    scheduleDate.setMinutes(roundedMinutes);
    scheduleDate.setMilliseconds(0);
    scheduleDate.setSeconds(0);
    const dataUpdate = {
      productClass: bodyData.productClass,
      productTag: bodyData.productTag,
      PPoEUser: bodyData.PPoEUser,
      status: "Waiting",
      fileName: bodyData.fileName,
      fileType: bodyData.fileType,
      updateDate: scheduleDate.toISOString(),
    };
    for (const key in dataUpdate) {
      if (dataUpdate[key] === undefined || dataUpdate[key] === null) {
        delete dataUpdate[key];
      }
    }
    await db.insertResource("deviceFirmwareUpdates", dataUpdate);
    ctx.body = {
      message: "Schedule created successfully",
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error };
  }
});

router.post("/devices/:id/tags", async (ctx) => {
  const authorizer: Authorizer = ctx.state.authorizer;
  const log = {
    message: "Update tags",
    context: ctx,
    deviceId: ctx.params.id,
    tags: ctx.request.body,
  };

  const filter = and(authorizer.getFilter("devices", 3), [
    "=",
    ["PARAM", "DeviceID.ID"],
    ctx.params.id,
  ]);
  if (!authorizer.hasAccess("devices", 3)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }
  const res = await db.query("devices", filter);
  if (!res.length) return void (ctx.status = 404);

  const validate = authorizer.getValidator("devices", res[0]);
  if (!validate("tags", ctx.request.body)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }

  try {
    await db.updateDeviceTags(ctx.params.id, ctx.request.body);
  } catch (error) {
    log.message += " failed";
    logger.accessWarn(log);
    ctx.body = error.message;
    return void (ctx.status = 400);
  }

  logger.accessInfo(log);

  ctx.body = "";
});

router.get("/ping/:host", async (ctx) => {
  if (!ctx.state.user) return void (ctx.status = 401);
  return new Promise<void>((resolve) => {
    ping(ctx.params.host, (err, parsed) => {
      if (parsed) {
        ctx.body = parsed;
      } else {
        ctx.status = 500;
        ctx.body = err ? `${err.name}: ${err.message}` : "Unknown error";
      }
      resolve();
    });
  });
});

router.put("/users/:id/password", async (ctx) => {
  const authorizer: Authorizer = ctx.state.authorizer;
  const username = ctx.params.id;
  const log = {
    message: "Change password",
    context: ctx,
    username: username,
  };

  if (!ctx.state.user) {
    // User not logged in
    if (
      !(await apiFunctions.authLocal(
        ctx.state.configSnapshot,
        username,
        ctx.request.body.authPassword
      ))
    ) {
      logUnauthorizedWarning(log);
      ctx.status = 401;
      ctx.body = "Authentication failed, check your username and password";
      return;
    }
  } else if (!authorizer.hasAccess("users", 3)) {
    logUnauthorizedWarning(log);
    return void (ctx.status = 403);
  }

  const filter = and(authorizer.getFilter("users", 3), [
    "=",
    ["PARAM", RESOURCE_IDS.users],
    username,
  ]);
  const res = await db.query("users", filter);
  if (!res.length) return void (ctx.status = 404);

  const newPassword = ctx.request.body.newPassword;
  if (ctx.state.user) {
    const validate = authorizer.getValidator("users", res[0]);
    if (!validate("password", { password: newPassword })) {
      logUnauthorizedWarning(log);
      return void (ctx.status = 403);
    }
  }

  const salt = await generateSalt(64);
  const password = await hashPassword(newPassword, salt);
  await db.putUser(username, { password, salt });

  await del("presets_hash");

  logger.accessInfo(log);
  ctx.body = "";
});

router.post("/logs", async (ctx) => {
  console.log("API create");
  await apiFunctions.postLogs(
    uuidv4(),
    "devices",
    "system",
    "write",
    ctx.request.body,
    null,
    ctx.state.user.username,
    null
  );

  ctx.body = "";
});
