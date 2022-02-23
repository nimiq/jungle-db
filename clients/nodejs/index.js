const JDB = require('../../dist/lmdb.js');

const db = new JDB.JungleDB('./database', 1);
const st = db.createObjectStore('testTable');
st.createIndex('prop');

db.connect().then(() => {
    st.values(JDB.Query.and(JDB.Query.ge('prop', 'dff'), JDB.Query.min('prop'))).then(console.log);
});
