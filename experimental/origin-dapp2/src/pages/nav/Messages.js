import React, { Component } from 'react'
import { Query } from 'react-apollo'
import get from 'lodash/get'

import MessagingQuery from 'queries/Messaging'
import ConversationsQuery from 'queries/Conversations'

import withWallet from 'hoc/withWallet'

import Dropdown from 'components/Dropdown'
import Link from 'components/Link'

class MessagesNav extends Component {
  constructor() {
    super()
    this.state = {}
  }
  render() {
    return (
      <Query query={MessagingQuery}>
        {({ data, loading, error }) => {
          if (loading || error) return null
          if (!get(data, 'web3.metaMaskAccount.id')) {
            return null
          }

          const hasUnread = '' // active'
          return (
            <Dropdown
              el="li"
              className="nav-item messages"
              open={this.props.open}
              onClose={() => this.props.onClose()}
              content={
                <MessagesDropdown
                  onClick={() => this.props.onClose()}
                  data={data}
                  wallet={this.props.wallet}
                />
              }
            >
              <a
                className="nav-link"
                href="#"
                onClick={e => {
                  e.preventDefault()
                  this.props.open ? this.props.onClose() : this.props.onOpen()
                }}
                role="button"
                aria-haspopup="true"
                aria-expanded="false"
              >
                <div className={`messages-icon${hasUnread}`} />
              </a>
            </Dropdown>
          )
        }}
      </Query>
    )
  }
}

const MessagesDropdown = (props) => {
  const { onClick, wallet } = props

  return (
    <div className="dropdown-menu dropdown-menu-right show messages">
      <Query query={ConversationsQuery} pollInterval={2000}>
        {({ data, error, loading }) => {
          if (loading || error) return null
          const conversations = get(data, 'messaging.conversations', [])
          const messages = conversations.map(({ messages }) => messages)
          const totalUnreadMessages = messages.flat().reduce((result, msg) => {
            if (msg.status === 'unread' && msg.address !== wallet) return [...result, msg]
            return result
          }, []).length

          return (
            <div>
              <div className="d-flex row unread-message">
                <span className={totalUnreadMessages > 0 ? 'count' : 'hide'}>
                  {totalUnreadMessages}
                </span>
                {totalUnreadMessages > 0 ? <span>Unread Message</span> : ''}
              </div>
              <Link to="/messages" onClick={() => onClick()}>
                View Messages
              </Link>
            </div>
          )
        }}
      </Query>
    </div>
  )
}

export default withWallet(MessagesNav)

require('react-styl')(`
  .navbar
    .nav-item
      .messages-icon
        width: 2.2rem
        height: 1.6rem
        background: url(images/messages-icon.svg) no-repeat center
        background-size: contain
        position:relative
        &.active
          &::after
            content: ""
            width: 14px
            height: 14px
            background: var(--greenblue)
            border-radius: 10px
            border: 2px solid var(--dusk)
            position: absolute
            top: -3px
            right: -3px
      &.show .messages-icon
        background-image: url(images/messages-icon-selected.svg)
      .dropdown-menu.messages
        padding: 1rem
      &.show
        .count
          border-radius: 44%
          background-color: var(--clear-blue)
          width: 28px
          height: 21px
          color: white
          padding-left: 9px
          padding-bottom: 23px
          font-weight: bold
        .hide
          display: none
        .unread-message
          width: 200px
          span
            margin-left: 10px
`)
