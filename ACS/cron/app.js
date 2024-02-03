var express = require('express');
var app = express();
const cron = require('node-cron');
const mongodb = require('./mongodb.js');
const { Worker } = require('worker_threads');
const { v4: uuidv4 } = require('uuid');
app.listen(3113, function () {
  console.log('Cron app listening on port 3113!');
});

const cronConnectionJob = cron.schedule('*/30 * * * * *', async () => {
  console.log("start cron");
  const db = await mongodb.connect();
  const deviceCollection = db.collection('devices');
  const alertCollection = db.collection('alerts');
  const configCollection = db.collection('config');
  const devicesResult = await deviceCollection.find({}).toArray();
  const alertStatus = {
    firing: 'firing',
    resolved: 'resolved'
  }
  let rxConfigMax = ""
  let txConfigMax = ""
  const adminConfigResult = await configCollection.find({
    _id: 'admin-config'
  }).toArray();
  // processArrayWithConcurrency(devicesResult, 2)
  //   .then((results) => {
  //     console.log(results)
  //   })
  //   .catch((error) => {
  //     console.log(error)
  //   });
  // console.log(devicesResult.length)
  if (adminConfigResult.length > 0) {
    let adminConfigValue = adminConfigResult[0].value
    rxConfigMax = JSON.parse(adminConfigValue).txThroughputMax
    txConfigMax = JSON.parse(adminConfigValue).rxThroughputMax

  }
  for (const device of devicesResult) {
    const timeDiffInMinutes = Math.round((new Date() - new Date(device._lastInform)) / (1000 * 60));
    if (timeDiffInMinutes >= 5 && (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax || parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax)) {
      let startTime
      let history = [];
      let txThroughputStatus = alertStatus.resolved;
      let rxThroughputStatus = alertStatus.resolved;
      const deviceResp = await alertCollection.find({
        deviceId: device._id
      }).toArray();
      if (deviceResp.length > 0) {
        if (deviceResp[0].connectionStatus === alertStatus.resolved && deviceResp[0].txThroughputStatus === alertStatus.resolved && deviceResp[0].rxThroughputStatus === alertStatus.resolved) {
          startTime = device._lastInform
        } else {
          startTime = deviceResp[0].startTime
        }
        if (deviceResp[0].connectionStatus === alertStatus.resolved) {
          deviceResp[0].history.push({
            time: device._lastInform,
            status: `connection down`,
          });
        }
        if (deviceResp[0].txThroughputStatus === alertStatus.resolved) {
          if (parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: `tx throughput over limit`,
            });
            txThroughputStatus = alertStatus.firing
          }
        } else {
          if (device.VirtualParameters.TxThroughput._value === "" || parseFloat(device.VirtualParameters.TxThroughput._value) <= txConfigMax) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: 'rx throughput normal',
            });
            txThroughputStatus = alertStatus.resolved
          } else {
            txThroughputStatus = alertStatus.firing
          }
        }
        if (deviceResp[0].rxThroughputStatus === alertStatus.resolved) {
          if (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: `rx throughput over limit`,
            });
            rxThroughputStatus = alertStatus.firing
          }
        } else {
          if (device.VirtualParameters.RxThroughput._value === "" || parseFloat(device.VirtualParameters.RxThroughput._value) <= rxConfigMax) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: 'rx throughput normal',
            });
            rxThroughputStatus = alertStatus.resolved
          } else {
            rxThroughputStatus = alertStatus.firing
          }
        }
      } else {
        history.push({
          time: device._lastInform,
          status: 'connection down',
        })
        if (parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax) {
          history.push({
            time: device._lastInform,
            status: `tx throughput over limit`,
          });
          txThroughputStatus = alertStatus.firing
        }
        if (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax) {
          history.push({
            time: device._lastInform,
            status: `rx throughput over limit`,
          });
          rxThroughputStatus = alertStatus.firing
        }
        startTime = device._lastInform
      }

      const data = {
        // _id: uuidv4(),
        deviceId: device._id,
        device: device,
        productClass: device._deviceId._ProductClass,
        serialNumber: device._deviceId._SerialNumber,
        lastInform: device._lastInform,
        pppoeUser: device.VirtualParameters.PPPoEACName._value,
        connectionStatus: alertStatus.firing,
        txThroughputStatus: txThroughputStatus,
        rxThroughputStatus: rxThroughputStatus,
        // history: deviceResp.length > 0 || (deviceResp.length > 0 && (deviceResp[0].connectionStatus === alertStatus.resolved || deviceResp[0].txThroughputStatus === alertStatus.resolved || deviceResp[0].rxThroughputStatus === alertStatus.resolved)) ? deviceResp[0].history: history,
        history: deviceResp.length > 0 ? deviceResp[0].history: history,
        startTime: startTime,
        endTime: device._lastInform
      }
      const filter = { deviceId: device._id };
      insertOrUpdateRecord(filter,data)
    } else {
      if (timeDiffInMinutes > 5) {
        console.log("down",timeDiffInMinutes);
        let startTime;
        let history = [];
        let rxThroughputStatus = alertStatus.resolved
        let txThroughputStatus = alertStatus.resolved
        const deviceResp = await alertCollection.find({
          deviceId: device._id
        }).toArray();
        if (deviceResp.length > 0) {
          if (deviceResp[0].connectionStatus === alertStatus.resolved && deviceResp[0].txThroughputStatus === alertStatus.resolved && deviceResp[0].rxThroughputStatus === alertStatus.resolved) {
            startTime = device._lastInform
          } else {
            startTime = deviceResp[0].startTime
          }
          if (deviceResp[0].connectionStatus === alertStatus.resolved) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: 'connection down',
            });
          }
          if (deviceResp[0].rxThroughputStatus === alertStatus.firing || deviceResp[0].txThroughputStatus === alertStatus.firing) {
            if (deviceResp[0].rxThroughputStatus === alertStatus.firing) {
              console.log("Rx Firing")
              if (device.VirtualParameters.RxThroughput._value === "" || parseFloat(device.VirtualParameters.RxThroughput._value) <= rxConfigMax) {
                deviceResp[0].history.push({
                  time: device._lastInform,
                  status: 'rx throughput normal',
                });
                console.log("Rx Firing Normal")
              }
            } else {
              if (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax) {
                deviceResp[0].history.push({
                  time: device._lastInform,
                  status: 'rx throughput over limit',
                });
                rxThroughputStatus = alertStatus.firing
              }
            }
            if (deviceResp[0].txThroughputStatus === alertStatus.firing) {
              if (device.VirtualParameters.TxThroughput._value === "" || parseFloat(device.VirtualParameters.TxThroughput._value) <= txConfigMax) {
                deviceResp[0].history.push({
                  time: device._lastInform,
                  status: 'tx throughput normal',
                });
                deviceResp[0].txThroughputStatus = alertStatus.resolved
              }
            } else {
              if (parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax) {
                deviceResp[0].history.push({
                  time: device._lastInform,
                  status: 'tx throughput over limit',
                });
                txThroughputStatus = alertStatus.firing
              }
            }
          }
        } else {
          history.push({
            time: device._lastInform,
            status:'connection down',
          })
          startTime = device._lastInform
        }

        const data = {
          // _id: uuidv4(),
          deviceId: device._id,
          device: device,
          productClass: device._deviceId._ProductClass,
          serialNumber: device._deviceId._SerialNumber,
          lastInform: device._lastInform,
          pppoeUser: device.VirtualParameters.PPPoEACName._value,
          connectionStatus:  alertStatus.firing,
          rxThroughputStatus:  rxThroughputStatus,
          txThroughputStatus:  txThroughputStatus,
          history: deviceResp.length > 0 ? deviceResp[0].history: history,
          startTime: startTime,
          endTime: device._lastInform
        }
        const filter = { deviceId: device._id };
        insertOrUpdateRecord(filter,data)
      }
      if (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax || parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax) {
        let history = [];
        let startTime;
        let rxThroughputStatus = alertStatus.resolved
        let txThroughputStatus = alertStatus.resolved
        const deviceResp = await alertCollection.find({
          deviceId: device._id
        }).toArray();
        if (deviceResp.length > 0) {
          if (deviceResp[0].connectionStatus === alertStatus.resolved && deviceResp[0].txThroughputStatus === alertStatus.resolved && deviceResp[0].rxThroughputStatus === alertStatus.resolved) {
            startTime = device._lastInform
          } else {
            startTime = deviceResp[0].startTime
          }
          if (deviceResp[0].connectionStatus === alertStatus.firing) {
            if (timeDiffInMinutes < 5) {
              console.log(timeDiffInMinutes)
              deviceResp[0].history.push({
                time: device._lastInform,
                status: 'connection up',
              });
              deviceResp[0].connectionStatus = alertStatus.resolved
            }
          }
          if (deviceResp[0].rxThroughputStatus === alertStatus.resolved) {
            if (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax) {
              deviceResp[0].history.push({
                time: device._lastInform,
                status: 'rx throughput over limit',
              });
              deviceResp[0].rxThroughputStatus = alertStatus.firing
            }
          } else {
            if (device.VirtualParameters.RxThroughput._value === "" || parseFloat(device.VirtualParameters.RxThroughput._value) <= rxConfigMax) {
              deviceResp[0].history.push({
                time: device._lastInform,
                status: 'rx throughput normal',
              });
            } else {
              deviceResp[0].rxThroughputStatus = alertStatus.resolved
            }
          }
          if (deviceResp[0].txThroughputStatus === alertStatus.resolved) {
            if (device.VirtualParameters.TxThroughput._value === "" || parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax) {
              deviceResp[0].history.push({
                time: device._lastInform,
                status: 'tx throughput over limit',
              });
              deviceResp[0].txThroughputStatus = alertStatus.firing
            }
          } else {
            if (device.VirtualParameters.TxThroughput._value === "" || parseFloat(device.VirtualParameters.TxThroughput._value) <= txConfigMax) {
              deviceResp[0].history.push({
                time: device._lastInform,
                status: 'tx throughput normal',
              });
            } else {
              deviceResp[0].txThroughputStatus = alertStatus.resolved
            }
          }
        } else {
          if (parseFloat(device.VirtualParameters.RxThroughput._value) > rxConfigMax) {
            history.push({
              time: device._lastInform,
              status: `rx throughput over limit`,
            });
            rxThroughputStatus = alertStatus.firing
          }
          if (parseFloat(device.VirtualParameters.TxThroughput._value) > txConfigMax) {
            history.push({
              time: device._lastInform,
              status: `tx throughput over limit`,
            });
            txThroughputStatus = alertStatus.firing
          }
          startTime = device._lastInform
        }

        const data = {
          // _id: uuidv4(),
          deviceId: device._id,
          device: device,
          productClass: device._deviceId._ProductClass,
          serialNumber: device._deviceId._SerialNumber,
          lastInform: device._lastInform,
          pppoeUser: device.VirtualParameters.PPPoEACName._value,
          connectionStatus:  deviceResp.length > 0 ? deviceResp[0].connectionStatus : alertStatus.resolved,
          rxThroughputStatus:  deviceResp.length > 0 ?  deviceResp[0].rxThroughputStatus : rxThroughputStatus,
          txThroughputStatus:  deviceResp.length > 0 ?  deviceResp[0].txThroughputStatus : txThroughputStatus,
          history: deviceResp.length > 0 ? deviceResp[0].history: history,
          startTime: startTime,
          endTime: device._lastInform
        }
        const filter = { deviceId: device._id };
        insertOrUpdateRecord(filter,data)
      }
      if (timeDiffInMinutes < 5 &&  (device.VirtualParameters.RxThroughput._value === "" || parseFloat(device.VirtualParameters.RxThroughput._value) <= rxConfigMax) && (device.VirtualParameters.TxThroughput._value === "" || parseFloat(device.VirtualParameters.TxThroughput._value) <= txConfigMax)) {
        const deviceResp = await alertCollection.find({
          deviceId: device._id
        }).toArray();
        if (deviceResp.length > 0) {
          if (deviceResp[0].connectionStatus === alertStatus.firing) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: 'connection up',
            });
            deviceResp[0].connectionStatus = alertStatus.resolved
          }
          if (deviceResp[0].rxThroughputStatus === alertStatus.firing) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: 'rx throughput normal',
            });
            deviceResp[0].rxThroughputStatus = alertStatus.resolved
          }
          if (deviceResp[0].txThroughputStatus === alertStatus.firing) {
            deviceResp[0].history.push({
              time: device._lastInform,
              status: 'tx throughput normal',
            });
            deviceResp[0].txThroughputStatus = alertStatus.resolved
          }
          const data = {
            // _id: uuidv4(),
            deviceId: device._id,
            device: device,
            productClass: device._deviceId._ProductClass,
            serialNumber: device._deviceId._SerialNumber,
            lastInform: device._lastInform,
            pppoeUser: device.VirtualParameters.PPPoEACName._value,
            connectionStatus:   deviceResp[0].connectionStatus,
            rxThroughputStatus:  deviceResp[0].rxThroughputStatus,
            txThroughputStatus:  deviceResp[0].txThroughputStatus,
            history: deviceResp[0].history,
            startTime: deviceResp.length > 0 ? deviceResp[0].startTime : device._lastInform,
            endTime: device._lastInform
          }
          const filter = { deviceId: device._id };
          insertOrUpdateRecord(filter,data)
        }
      }
      // else if (timeDiffInMinutes < 5) {
      //   let connectionStatus = alertStatus.resolved
      //   let rxThroughputStatus = alertStatus.resolved
      //   let txThroughputStatus = alertStatus.resolved
      //   let type = '1'
      //   let history = []
      //   const deviceResp = await alertCollection.find({
      //     deviceId: device._id
      //   }).toArray();
      //   if (deviceResp.length > 0) {
      //     if (deviceResp[0].connectionStatus === alertStatus.firing) {
      //       deviceResp[0].history.push({
      //         time: device._lastInform,
      //         status: 'connection up',
      //       });
      //       connectionStatus = alertStatus.resolved
      //     }
      //     if (deviceResp[0].rxThroughputStatus === alertStatus.firing || deviceResp[0].txThroughputStatus === alertStatus.firing) {
      //       if (deviceResp[0].rxThroughputStatus === alertStatus.firing) {
      //         if (device.VirtualParameters.RxThroughput._value <= rxConfigMax) {
      //           deviceResp[0].history.push({
      //             time: device._lastInform,
      //             status: 'rx throughput normal',
      //           });
      //           deviceResp[0].rxThroughputStatus = alertStatus.resolved
      //         }
      //       } else {
      //         if (device.VirtualParameters.TxThroughput._value > rxConfigMax) {
      //           deviceResp[0].history.push({
      //             time: device._lastInform,
      //             status: 'rx throughput over limit',
      //           });
      //           rxThroughputStatus = alertStatus.firing
      //           type = '2'
      //         }
      //       }
      //       if (deviceResp[0].txThroughputStatus === alertStatus.firing) {
      //         if (device.VirtualParameters.TxThroughput._value <= txConfigMax) {
      //           deviceResp[0].history.push({
      //             time: device._lastInform,
      //             status: 'tx throughput normal',
      //           });
      //         }
      //       } else {
      //         if (device.VirtualParameters.TxThroughput._value > txConfigMax) {
      //           deviceResp[0].history.push({
      //             time: device._lastInform,
      //             status: 'tx throughput over limit',
      //           });
      //           txThroughputStatus = alertStatus.firing
      //           type = '2'
      //         }
      //       }
      //     }
      //   } else {
      //     if (device.VirtualParameters.RxThroughput._value > rxConfigMax) {
      //       history.push({
      //         time: device._lastInform,
      //         status: `rx throughput over limit`,
      //       });
      //       rxThroughputStatus = alertStatus.firing
      //     }
      //     if (device.VirtualParameters.TxThroughput._value > txConfigMax) {
      //       history.push({
      //         time: device._lastInform,
      //         status: `tx throughput over limit`,
      //       });
      //       txThroughputStatus = alertStatus.firing
      //     }
      //   }
      //     const data = {
      //       // _id: uuidv4(),
      //       deviceId: device._id,
      //       device: device,
      //       productClass: device._deviceId._ProductClass,
      //       serialNumber: device._deviceId._SerialNumber,
      //       lastInform: device._lastInform,
      //       pppoeUser: device.VirtualParameters.PPPoEACName._value,
      //       connectionStatus: connectionStatus,
      //       txThroughputStatus: txThroughputStatus,
      //       rxThroughputStatus: rxThroughputStatus,
      //       type: type,
      //       history: deviceResp.length > 0 ? deviceResp[0].history : history,
      //       time: new Date()
      //     }
      //     // console.log(data);
      //     const filter = { deviceId: device._id };
      //     insertOrUpdateRecord(filter,data)
      // }
      // if (device.VirtualParameters.RxThroughput._value > rxConfigMax || device.VirtualParameters.TxThroughput._value > txConfigMax) {
      //   let type = '2';
      //   let history = [];
      //   let rxThroughputStatus = alertStatus.resolved
      //   let txThroughputStatus = alertStatus.resolved
      //   const deviceResp = await alertCollection.find({
      //     deviceId: device._id
      //   }).toArray();
      //   if (deviceResp.length > 0) {
      //     if (deviceResp[0].connectionStatus === alertStatus.firing) {
      //       if (timeDiffInMinutes < 5) {
      //         deviceResp[0].history.push({
      //           time: device._lastInform,
      //           status: 'connection up',
      //         });
      //       }
      //     }
      //     if (deviceResp[0].rxThroughputStatus === alertStatus.resolved) {
      //       if (device.VirtualParameters.RxThroughput._value > rxConfigMax) {
      //         deviceResp[0].history.push({
      //           time: device._lastInform,
      //           status: 'rx throughput over limit',
      //         });
      //         rxThroughputStatus = alertStatus.firing
      //       }
      //     } else {
      //       if (device.VirtualParameters.RxThroughput._value <= rxConfigMax) {
      //         deviceResp[0].history.push({
      //           time: device._lastInform,
      //           status: 'rx throughput normal',
      //         });
      //       }
      //     }
      //     if (deviceResp[0].txThroughputStatus === alertStatus.resolved) {
      //       if (device.VirtualParameters.TxThroughput._value > txConfigMax) {
      //         deviceResp[0].history.push({
      //           time: device._lastInform,
      //           status: 'tx throughput over limit',
      //         });
      //         txThroughputStatus = alertStatus.firing
      //       }
      //     } else {
      //       if (device.VirtualParameters.TxThroughput._value <= txConfigMax) {
      //         deviceResp[0].history.push({
      //           time: device._lastInform,
      //           status: 'tx throughput normal',
      //         });
      //       }
      //     }
      //     } else {
      //      if (device.VirtualParameters.RxThroughput._value > rxConfigMax) {
      //       history.push({
      //         time: device._lastInform,
      //         status: `rx throughput over limit`,
      //       });
      //        rxThroughputStatus = alertStatus.firing
      //      }
      //     if (device.VirtualParameters.TxThroughput._value > txConfigMax) {
      //       history.push({
      //         time: device._lastInform,
      //         status: `tx throughput over limit`,
      //       });
      //       txThroughputStatus = alertStatus.firing
      //     }
      //   }
      //
      //   const data = {
      //     // _id: uuidv4(),
      //     deviceId: device._id,
      //     device: device,
      //     productClass: device._deviceId._ProductClass,
      //     serialNumber: device._deviceId._SerialNumber,
      //     lastInform: device._lastInform,
      //     pppoeUser: device.VirtualParameters.PPPoEACName._value,
      //     connectionStatus:  alertStatus.resolved,
      //     rxThroughputStatus:  rxThroughputStatus,
      //     txThroughputStatus:  txThroughputStatus,
      //     type: type,
      //     history: deviceResp.length > 0 ? deviceResp[0].history: history,
      //     time: new Date()
      //   }
      //   const filter = { deviceId: device._id };
      //   insertOrUpdateRecord(filter,data)
      // }
    }
  }
});

cronConnectionJob.start();


const cronClearJob = cron.schedule('0 17 * * *', async () => {
  console.log("start cron clear");
  const db = await mongodb.connect();
  const alertCollection = db.collection('alerts');
  const logsCollection = db.collection('logs');
  const configCollection = db.collection('config');
  let configClearTime = 12
  const adminConfigResult = await configCollection.find({
    _id: 'admin-config'
  }).toArray();
  if (adminConfigResult.length > 0) {
    let adminConfigValue = adminConfigResult[0].value
    configClearTime = JSON.parse(adminConfigValue).configClearTime
  }


  var currentDate = new Date();
  var timeAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - configClearTime, currentDate.getDate(), currentDate.getHours(),currentDate.getMinutes(), currentDate.getSeconds(), currentDate.getMilliseconds())

  const logResp = await logsCollection.find({ timestamp: { $lt: timeAgo.getTime() } }).toArray();
  const alertResp = await alertCollection.find({
    connectionStatus: 'resolved',
    rxThroughputStatus: 'resolved',
    txThroughputStatus: 'resolved',
    endTime: { $lt: timeAgo}
  }).toArray();
  if (logResp.length > 0) {
    logResp.forEach(item => {
      logsCollection.deleteOne({ _id: item._id }, (err) => {
        console.log("deleted item ", item.action)
      });
    })
  }
  if (alertResp.length > 0) {
    alertResp.forEach(item => {
      logsCollection.deleteOne({ deviceId: item.deviceId }, (err) => {
        console.log("deleted item ", item.deviceId)
      });
    })
  }
});

cronClearJob.start();

async function insertOrUpdateRecord(filter, data) {

  try {
    const db = await mongodb.connect();
    const collection = db.collection('alerts');

    const options = { upsert: true };

    await collection.updateOne(filter, { $set: data }, options);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // await client.close();
  }
}
