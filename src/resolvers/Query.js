// this is place to interact with databases, external API, access the file system (e.g., csv file)
const Query = {
  schools(parent, args, ctx, info) {
    // return [{name: 'Hogwarts'}, {name: '1903'}]
    global.schools = global.schools || []
    return global.schools
  },

};

module.exports = Query;
