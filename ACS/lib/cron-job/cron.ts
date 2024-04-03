// import cron from "node-cron";
import * as dbQuery from "../ui/db";
import * as apiFunctions from "./../../lib/ui/api-functions";
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");
import { and } from "../common/expression";

export const cronUpdateFirmware = cron.schedule("0 */5 * * * *", async () => {
  try {
    // const currentTime = new Date("2024-03-28T11:25:00.000Z");
    const currentTime = new Date();
    currentTime.setMilliseconds(0);
    currentTime.setSeconds(0);
    const allDeviceQueueQuery = {
      updateDate: currentTime.toISOString(),
    };
    const devicesQueue = await dbQuery.getDeviceFromUpdateQueue(
      "deviceFirmwareUpdates",
      allDeviceQueueQuery
    );
    for (const device of devicesQueue) {
      const resultUpdate = [];
      if (device.productTag) {
        const filter = {
          _tags: { $in: [device.productTag] },
        };
        const devicesTag = await dbQuery.getDeviceFromUpdateQueue(
          "devices",
          filter
        );
        for (const deviceDb of devicesTag) {
          const requestBody = [
            {
              device: deviceDb._id,
              name: "download",
              fileName: device.fileName,
              fileType: device.fileType,
            },
          ];
          const deviceUpdate = await getDeviceAndUpdate(
            deviceDb._id,
            requestBody,
            4000
          );
          resultUpdate.push(deviceUpdate);
        }
      } else if (device.productClass) {
        const filter = {
          "_deviceId._ProductClass": device.productClass,
        };
        const devicesClass = await dbQuery.getDeviceFromUpdateQueue(
          "devices",
          filter
        );
        for (const deviceDb of devicesClass) {
          const requestBody = [
            {
              device: deviceDb._id,
              name: "download",
              fileName: device.fileName,
              fileType: device.fileType,
            },
          ];
          const deviceUpdate = await getDeviceAndUpdate(
            deviceDb._id,
            requestBody,
            4000
          );
          resultUpdate.push(deviceUpdate);
        }
      } else if (device.PPoEUser) {
        const filter = {
          "VirtualParameters.PPPoEACName._value": device.PPoEUser,
        };
        const devicesPPoE = await dbQuery.getDeviceFromUpdateQueue(
          "devices",
          filter
        );
        for (const deviceDb of devicesPPoE) {
          const requestBody = [
            {
              device: deviceDb._id,
              name: "download",
              fileName: device.fileName,
              fileType: device.fileType,
            },
          ];
          const deviceUpdate = await getDeviceAndUpdate(
            deviceDb._id,
            requestBody,
            4000
          );
          resultUpdate.push(deviceUpdate);
        }
      }
      const hasFailed = resultUpdate.some((obj) => obj.isSuccess === false);
      const updatedFinishDate = new Date();
      if (hasFailed) {
        await dbQuery.updateDeviceFromUpdateQueue(
          device._id,
          "Failed",
          updatedFinishDate
        );
      } else {
        await dbQuery.updateDeviceFromUpdateQueue(
          device._id,
          "Success",
          updatedFinishDate
        );
      }
    }
  } catch (error) {
    console.error("Error in cron job:", error);
  }
});

const getDeviceAndUpdate = async (deviceId, requestBody, timeOut) => {
  let isSuccess = false;
  const filterForDevice = and(true, ["=", ["PARAM", "DeviceID.ID"], deviceId]);
  const devicesForUpdate = await dbQuery.query("devices", filterForDevice);
  if (!devicesForUpdate.length) {
    console.log(`Device not found with id: ${deviceId}`);
  }
  const device = devicesForUpdate[0];
  const res = await apiFunctions.postTasks(
    deviceId,
    requestBody,
    timeOut,
    device
  );
  if (res.connectionRequest === "OK") {
    isSuccess = true;
    res.tasks.forEach((task) => {
      if (task.status === "fault") {
        console.log(task.fault);
        apiFunctions.postLogs(
          uuidv4(),
          "devices",
          "device",
          "write",
          null,
          task,
          "Admin",
          device
        );
      } else if (task.status === "done") {
        apiFunctions.postLogs(
          uuidv4(),
          "devices",
          "device",
          "write",
          null,
          task,
          "Username",
          device
        );
      }
    });
  } else if (res.connectionRequest === "Device is offline") {
    res.tasks.forEach((task) => {
      const log = {
        action: `Device ${deviceId} is offline`,
        type: "",
      };
      apiFunctions.postLogs(
        uuidv4(),
        "devices",
        "device",
        "write",
        log,
        task,
        "Admin",
        device
      );
    });
  }
  console.log("res", res);

  return {
    res,
    isSuccess,
  };
};

cronUpdateFirmware.start();
