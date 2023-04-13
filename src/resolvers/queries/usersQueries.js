const usersQueries = {
  // get all usernames (but not participants)
  async allUsernames(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    const users = await ctx.db.query.profiles({}, info);
    const notParticipants = users.filter(
      (user) =>
        user.permissions.includes("TEACHER") ||
        user.permissions.includes("STUDENT") ||
        user.permissions.includes("SCIENTIST")
    );
    return notParticipants;
  },

  // get all public usernames (people in the class, admin and scientists)
  async allPublicUsernames(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }

    const me = await ctx.db.query.profile(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id studentIn { id network{id classes{id}} } teacherIn { id network{id classes{id}} } mentorIn { id network{id classes{id}} } }`
    );

    // get all classes
    const classIds = [
      ...me.studentIn?.map((c) => c.id),
      ...me.teacherIn?.map((c) => c.id),
      ...me.mentorIn?.map((c) => c.id),
    ];
    // get all classes in the class networks
    const allClassInNetworkIds = [
      ...me.studentIn?.map((c) => c.network?.classes?.map((cl) => cl.id)),
      ...me.teacherIn?.map((c) => c.network?.classes?.map((cl) => cl.id)),
      ...me.mentorIn?.map((c) => c.network?.classes?.map((cl) => cl.id)),
    ].flat();
    // merge ids
    const allClassIds = [
      ...new Set([...classIds, ...allClassInNetworkIds]),
    ].filter((id) => !!id);

    const users = await ctx.db.query.profiles(
      {
        where: {
          OR: [
            { isPublic: true },
            {
              studentIn_some: { id_in: allClassIds },
            },
            {
              teacherIn_some: { id_in: allClassIds },
            },
            {
              mentorIn_some: { id_in: allClassIds },
            },
            {
              username_in: args.usernames,
            },
          ],
        },
      },
      info
    );

    return users;
  },

  // study participants
  async participantsInStudy(parent, args, ctx, info) {
    const participants = await ctx.db.query.profiles(
      {
        where: {
          participantIn_some: { id: args.studyId },
          OR: [
            { publicId_contains: args.search },
            { publicReadableId_contains: args.search },
          ],
        },
      },
      info
    );
    const participantsInfo = participants.map((p) => ({
      ...p,
      info: { type: "User" },
    }));

    const guests = await ctx.db.query.guests(
      {
        where: {
          guestParticipantIn_some: { id: args.studyId },
          OR: [
            { publicId_contains: args.search },
            { publicReadableId_contains: args.search },
          ],
        },
      },
      info
    );
    const guestsInfo = guests.map((g) => ({
      ...g,
      info: { type: "Guest" },
    }));

    return [...participantsInfo, ...guestsInfo];
  },

  // study participants
  // async participantsInStudy(parent, args, ctx, info) {
  //   // 1. check if the user has permission to see the study (Scientist of this study) or Admin
  //   const { where } = args;
  //   // const mystudy = await ctx.db.query.study(
  //   //   { where },
  //   //   `{ id title author {id} collaborators {id}}`
  //   // );
  //   // const ownsStudy = mystudy.author.id === ctx.request.userId;
  //   // const hasPermissions = ctx.request.user.permissions.some(permission =>
  //   //   ['ADMIN'].includes(permission)
  //   // );
  //   // let collaboratorInStudy;
  //   // if (mystudy.collaborators) {
  //   //   const collaboratorsIds = mystudy.collaborators.map(
  //   //     collaborator => collaborator.id
  //   //   );
  //   //   collaboratorInStudy = collaboratorsIds.includes(ctx.request.userId);
  //   // }
  //   //
  //   // if (!ownsStudy && !hasPermissions && !collaboratorInStudy) {
  //   //   throw new Error(`You don't have permission to do that!`);
  //   // }
  //   return ctx.db.query.profiles({ where }, info);
  // },

  // study guest participants
  async guestParticipantsInStudy(parent, args, ctx, info) {
    const { where } = args;
    return ctx.db.query.guests({ where }, info);
  },

  // study participants
  async myStudyParticipants(parent, args, ctx, info) {
    // 1. check if the user has permission to see the study (Scientist of this study) or Admin
    const { where } = args;
    const mystudy = await ctx.db.query.study(
      { where },
      `{ id title author {id} collaborators {id}}`
    );
    const ownsStudy = mystudy.author.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ["ADMIN"].includes(permission)
    );
    let collaboratorInStudy;
    if (mystudy.collaborators) {
      const collaboratorsIds = mystudy.collaborators.map(
        (collaborator) => collaborator.id
      );
      collaboratorInStudy = collaboratorsIds.includes(ctx.request.userId);
    }

    if (!ownsStudy && !hasPermissions && !collaboratorInStudy) {
      throw new Error(`You don't have permission to do that!`);
    }

    return ctx.db.query.study({ where }, info);
  },

  async student(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    // TODO check authorization (being an admin or a teacher of the class)

    const student = await ctx.db.query.profile(
      {
        where: {
          id: args.id,
        },
      },
      info
    );

    return student;
  },

  // query a participant of a study
  async participant(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    // TODO check authorization (being an admin or a researcher of the study)

    const participant = await ctx.db.query.profile(
      {
        where: {
          id: args.participantId,
        },
      },
      info
    );

    return participant;
  },

  // query a guest participant of a study
  async guestParticipant(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }

    const participant = await ctx.db.query.guest(
      {
        where: {
          id: args.participantId,
        },
      },
      info
    );

    return participant;
  },

  // count all users
  async countUsers(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    const profilesConnection = await ctx.db.query.profilesConnection({}, info);
    return profilesConnection;
  },

  // count all study participants
  async countStudyParticipants(parent, args, ctx, info) {
    const { where } = args;
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    return ctx.db.query.profilesConnection({ where }, info);
  },

  // count all study guest participants
  async countStudyGuestParticipants(parent, args, ctx, info) {
    const { where } = args;
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that!");
    }
    return ctx.db.query.guestsConnection({ where }, info);
  },
};

module.exports = usersQueries;
