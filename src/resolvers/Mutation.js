const Mutations = {

  createSchool (parent, args, ctx, info) {
    // create a school
    // args contains the incoming parameters (like a name of the school - args.name)
    console.log('args', args)
    global.schools = global.schools || []
    const newSchool = {name: args.name}
    global.schools.push(newSchool)
    return newSchool
  },

};

module.exports = Mutations;
