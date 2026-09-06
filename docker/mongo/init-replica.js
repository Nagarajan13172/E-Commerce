// Idempotently initiate the single-node replica set.
//
// A replica set is REQUIRED even in development: checkout reserves stock for
// every line item inside a transaction, and transactions do not exist on a
// standalone mongod. Members advertise "mongo:27017", but every client connects
// with ?directConnection=true, which bypasses topology discovery — so the same
// URI shape works from the host and from sibling containers.

try {
  const status = rs.status();
  print(`[mongo-init] replica set "${status.set}" already initiated — nothing to do.`);
} catch (err) {
  // NotYetInitialized (94) is the expected first-run error; anything else is real.
  if (err.code !== 94 && !/no replset config/i.test(err.message ?? '')) {
    print(`[mongo-init] unexpected error while reading rs.status(): ${err.message}`);
    quit(1);
  }

  print('[mongo-init] initiating replica set rs0 ...');
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }],
  });

  // Wait for this node to actually reach PRIMARY, otherwise the first write
  // from the API can race the election and fail with NotWritablePrimary.
  let attempts = 0;
  while (attempts < 60) {
    const isPrimary = db.hello().isWritablePrimary;
    if (isPrimary) {
      print('[mongo-init] replica set is PRIMARY and ready for transactions.');
      quit(0);
    }
    sleep(500);
    attempts += 1;
  }

  print('[mongo-init] timed out waiting for PRIMARY.');
  quit(1);
}
