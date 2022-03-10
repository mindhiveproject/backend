const slugify = require('slugify');

const proposalMutations = {
  // copy proposal board
  async copyProposalBoard(parent, args, ctx, info) {
    // find a proposal board with this id
    const where = { id: args.id };
    const template = await ctx.db.query.proposalBoard(
      { where },
      `{ id slug title description sections { id title position cards { id title description position content } } }`
    );

    // make a full copy
    const arguments = {
      title: template.description,
      description: template.description,
      slug: `${template.slug}-${Date.now()}-${Math.round(
        Math.random() * 100000
      )}`, // to do where the slug should be taken from?
    };
    // create a new board
    const board = await ctx.db.mutation.createProposalBoard(
      {
        data: {
          author: {
            connect: {
              id: ctx.request.userId,
            },
          },
          study: {
            connect: {
              id: args.study,
            },
          },
          ...arguments,
        },
      },
      info
    );
    // create new sections
    await Promise.all(
      template.sections.map(async (section, i) => {
        const templateSection = template.sections[i];
        const newSection = await ctx.db.mutation.createProposalSection(
          {
            data: {
              title: templateSection.title,
              position: templateSection.position,
              board: {
                connect: { id: board.id },
              },
            },
          },
          `{ id }`
        );
        // create cards of this section
        await Promise.all(
          templateSection.cards.map(async (card, i) => {
            const templateCard = section.cards[i];
            const newCard = await ctx.db.mutation.createProposalCard(
              {
                data: {
                  section: {
                    connect: {
                      id: newSection.id,
                    },
                  },
                  title: templateCard.title,
                  description: templateCard.description,
                  content: templateCard.content,
                  position: templateCard.position,
                },
              },
              `{ id }`
            );
          })
        );
      })
    );
    return board;
  },

  // create new proposal board template
  async createProposalBoard(parent, args, ctx, info) {
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
    const where = { id: args.id };
    // find the board information
    const board = await ctx.db.query.proposalBoard(
      { where },
      `{ id sections { id cards { id } } }`
    );
    if (board.sections.length) {
      // delete all cards
      const cardIds = board.sections
        .map(section => section.cards.map(card => card.id))
        .flat();
      if (cardIds.length) {
        await ctx.db.mutation.deleteManyProposalCards({
          where: { id_in: cardIds },
        });
      }
      // delete all sections
      const sectionIds = board.sections.map(section => section.id);
      await ctx.db.mutation.deleteManyProposalSections({
        where: { id_in: sectionIds },
      });
    }
    // delete it
    return ctx.db.mutation.deleteProposalBoard({ where }, info);
  },

  // create new section
  async createProposalSection(parent, args, ctx, info) {
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
    return section;
  },

  // update section
  async updateProposalSection(parent, args, ctx, info) {
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
    return section;
  },

  // delete section
  async deleteProposalSection(parent, args, ctx, info) {
    const where = { id: args.id };

    // delete all cards of this section
    // find cards of this section
    const consent = await ctx.db.query.proposalSection(
      { where },
      `{ id cards {id} }`
    );
    if (consent.cards.length) {
      await ctx.db.mutation.deleteManyProposalCards({
        where: { id_in: consent.cards.map(card => card.id) },
      });
    }

    const deletedSection = await ctx.db.mutation.deleteProposalSection(
      { where },
      info
    );

    return deletedSection;
  },

  // / create new card
  async createProposalCard(parent, args, ctx, info) {
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

    return card;
  },

  // update card
  async updateProposalCard(parent, args, ctx, info) {
    // add collaborators
    let assignedTo = [];
    if (args.assignedTo) {
      // get the card
      const card = await ctx.db.query.proposalCard(
        {
          where: { id: args.id },
        },
        `{ id assignedTo { id } }`
      );
      // disconnect previous collaborators
      await ctx.db.mutation.updateProposalCard(
        {
          data: {
            assignedTo: {
              disconnect: card.assignedTo,
            },
          },
          where: {
            id: args.id,
          },
        },
        `{ id }`
      );

      if (args.assignedTo.length) {
        assignedTo = await Promise.all(
          args.assignedTo.map(username =>
            ctx.db.query.profile({ where: { username } }, `{ id }`)
          )
        );
        assignedTo = assignedTo.filter(c => c);
      }
    }

    // update new card
    const card = await ctx.db.mutation.updateProposalCard(
      {
        data: {
          position: args.position,
          title: args.title,
          content: args.content,
          comment: args.comment,
          description: args.description,
          section: args.sectionId
            ? {
                connect: {
                  id: args.sectionId,
                },
              }
            : null,
          assignedTo: {
            connect: assignedTo,
          },
          settings: args.settings,
        },
        where: {
          id: args.id,
        },
      },
      info
    );
    return card;
  },

  // delete card
  async deleteProposalCard(parent, args, ctx, info) {
    const where = { id: args.id };
    // delete it
    const deletedCard = await ctx.db.mutation.deleteProposalCard(
      { where },
      info
    );
    return deletedCard;
  },
};

module.exports = proposalMutations;
