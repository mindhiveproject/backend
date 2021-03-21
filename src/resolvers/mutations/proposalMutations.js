const slugify = require('slugify');

const proposalMutations = {
  // create new proposal board template
  async createProposalBoard(parent, args, ctx, info) {
    console.log('args', args);
    // create slug
    args.slug = slugify(args.title, {
      replacement: '-', // replace spaces with replacement character, defaults to `-`
      remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
      lower: true, // convert to lower case, defaults to `false`
    });
    // create new board
    // this is to create a relationship between the study and the author

    const board = await ctx.db.mutation.createProposalBoard(
      {
        data: {
          creator: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );
    return board;
  },

  async updateProposalBoard(parent, args, ctx, info) {
    // take a copy of updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // ToDo check
    const board = await ctx.db.mutation.updateProposalBoard(
      {
        data: { ...updates },
        where: {
          id: args.id,
        },
      },
      info
    );
    return board;
  },

  // delete board
  async deleteProposalBoard(parent, args, ctx, info) {
    console.log('args for delete', args);
    const where = { id: args.id };
    // TODO delete all cards and sections

    // delete it
    return ctx.db.mutation.deleteProposalBoard({ where }, info);
  },

  // / create new section
  async createProposalSection(parent, args, ctx, info) {
    console.log('args', args);
    // args.slug = slugify(args.title, {
    //   replacement: '-', // replace spaces with replacement character, defaults to `-`
    //   remove: /[^a-zA-Z\d\s:]/g, // remove characters that match regex, defaults to `undefined`
    //   lower: true, // convert to lower case, defaults to `false`
    // });
    // create new section
    const section = await ctx.db.mutation.createProposalSection(
      {
        data: {
          title: args.title,
          // slug: args.slug,
          description: args.description,
          position: args.position,
          board: {
            connect: { id: args.boardId },
          },
        },
      },
      info
    );
    // // fire an event for subscription
    // const p = await ctx.pubSub.publish('sectionAdded', {
    //   sectionAdded: section,
    //   boardId: args.boardId,
    // });
    return section;
  },

  // update section
  async updateProposalSection(parent, args, ctx, info) {
    console.log('line 52 args', args);

    // update new section
    const section = await ctx.db.mutation.updateProposalSection(
      {
        data: {
          position: args.position,
          title: args.title,
          description: args.description,
          cards: args.cards,
        },
        where: {
          id: args.id,
        },
      },
      info
    );
    console.log('section', section);
    // fire an event for subscription
    // const p = await ctx.pubSub.publish('sectionUpdated', {
    //   sectionUpdated: section,
    //   boardId: args.boardId,
    // });
    return section;
  },

  // delete section
  async deleteProposalSection(parent, args, ctx, info) {
    console.log('args', args);
    const where = { id: args.id };

    // delete section from board
    // await ctx.db.mutation.updateSection(
    //   {
    //     data: {
    //       board: {
    //         disconnect: {
    //           id: args.boardId
    //         }
    //       }
    //     },
    //     where: {
    //       id: args.id,
    //     }
    //   },
    //   `{ id }`
    // )

    //
    const deletedSection = await ctx.db.mutation.deleteProposalSection(
      { where },
      info
    );

    // const board = await ctx.db.mutation.updateBoard(
    //   {
    //     data: {
    //       sections: {
    //         disconnect: {
    //           id: args.id
    //         }
    //       }
    //     },
    //     where: {
    //       id: args.boardId,
    //     }
    //   },
    //   `{ id }`
    // )
    // fire an event for subscription
    // const p = await ctx.pubSub.publish('sectionDeleted', {
    //   sectionDeleted: deletedSection,
    //   boardId: args.boardId,
    // });
    // delete it
    return deletedSection;
  },

  // / create new card
  async createProposalCard(parent, args, ctx, info) {
    console.log('args', args);

    const card = await ctx.db.mutation.createProposalCard(
      {
        data: {
          section: {
            connect: {
              id: args.sectionId,
            },
          },
          title: args.title,
          content: args.content,
          position: args.position,
        },
      },
      info
    );

    console.log('card', card);

    // fire subscription
    // const p = await ctx.pubSub.publish('cardAdded', {
    //   cardAdded: card,
    //   boardId: args.boardId,
    // });

    return card;
  },

  // update card
  async updateProposalCard(parent, args, ctx, info) {
    console.log('37   args', args);

    // update new card
    const card = await ctx.db.mutation.updateProposalCard(
      {
        data: {
          position: args.position,
          title: args.title,
          content: args.content,
          section: {
            connect: {
              id: args.sectionId,
            },
          },
        },
        where: {
          id: args.id,
        },
      },
      info
    );
    console.log('card', card);
    // fire an event for subscription
    // const p = await ctx.pubSub.publish('cardUpdated', {
    //   cardUpdated: card,
    //   boardId: args.boardId,
    // });
    return card;
  },

  // delete card
  async deleteProposalCard(parent, args, ctx, info) {
    console.log('args', args);
    const where = { id: args.id };
    // delete it
    const deletedCard = await ctx.db.mutation.deleteProposalCard(
      { where },
      info
    );
    console.log('deletedCard', deletedCard);
    // fire subscription
    // const p = await ctx.pubSub.publish('cardDeleted', {
    //   cardDeleted: deletedCard,
    //   boardId: args.boardId,
    // });
    return deletedCard;
  },
};

module.exports = proposalMutations;
