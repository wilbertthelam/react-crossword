import React from 'react';
import PropTypes from 'prop-types';

import produce from 'immer';
import styled from 'styled-components';

import { cloneDeep } from 'lodash';
import Cell from '../Cell/Cell';
import {
  bothDirections,
  createGridData,
  serializeGuesses,
  deserializeGuesses,
  findCorrectAnswers,
} from './util';

// TODO: make this a component property!
const defaultStorageKey = 'guesses';

// eslint-disable-next-line
const Wrapper = styled.div.attrs(props => ({
  className: 'crossword',
}))`
  margin: 0;
  padding: 0;
  border: 0;
  /* position: relative; */
  /* width: 40%; */
  display: flex;
  flex-direction: row;

  @media (max-width: ${props => props.columnBreakpoint}) {
    flex-direction: column;
  }
`;

const GridWrapper = styled.div.attrs(props => ({
  className: 'grid',
}))`
  /* position: relative; */
  min-width: 20rem;
  max-width: 60rem; /* Should the size matter? */
  width: auto;
  flex: 2 1 50%;
`;

const ClueWrapper = styled.div.attrs(props => ({
  className: 'clues',
}))`
  padding: 0 1em;
  flex: 1 2 25%;

  @media (max-width: ${props => props.columnBreakpoint}) {
    margin-top: 2em;
  }

  .direction {
    margin-bottom: 2em;
    /* padding: 0 1em;
    flex: 1 1 20%; */

    .header {
      margin-top: 0;
      margin-bottom: 0.5em;
    }

    div {
      margin-top: 0.5em;
    }
  }
`;

const Clue = styled.div.attrs(props => ({
  className: 'clue',
}))`
  cursor: default;
  background-color: ${props =>
    props.focused &&
    props.currentDirection === props.clueDirection &&
    props.highlight === props.number
      ? props.highlightBackground
      : 'transparent'};
`;

/**
 * The primary, and default, export from the react-crossword library, Crossword
 * renders an answer grid and clues, and manages data and user interaction.
 */
class Crossword extends React.Component {
  constructor(props) {
    super(props);

    this.handleCellClick = this.handleCellClick.bind(this);
    this.handleInputClick = this.handleInputClick.bind(this);
    this.handleClueClick = this.handleClueClick.bind(this);
    this.handleInputKeyDown = this.handleInputKeyDown.bind(this);
    this.handleInputChange = this.handleInputChange.bind(this);

    this.svgRef = React.createRef();
    this.inputRef = React.createRef();

    this.storageKey = defaultStorageKey; // TODO take from props

    const { size, gridData, clues } = createGridData(props.data);
    this.loadGuesses(gridData);

    this.state = {
      size,
      gridData,
      clues,

      focused: false,

      // Should we start with 1-across highlighted/focused?
      // TODO: track input-field focus so we don't draw highlight when we're
      // not really focused, *and* use first actual clue (whether across or
      // down?)
      focusedRow: 0, // row/col separately, or as a single object?
      focusedCol: 0,
      highlight: '1',
      currentDirection: 'across',

      // special handler for bulk input change (copy/paste)
      // bulkChange: null,
    };
  }

  componentDidUpdate(prevProps, prevState) {
    // let { bulkChange } = this.state;

    // guessState comes in via the server sending a new guess state
    const { data, guessState } = this.props;

    // Trigger state update if there is a new guessState incoming from the server
    if (
      JSON.stringify(JSON.parse(guessState).guesses) !==
      JSON.stringify(JSON.parse(prevProps.guessState).guesses)
    ) {
      const { gridData } = this.state;
      const newGridData = cloneDeep(gridData);

      this.loadGuesses(newGridData);

      if (
        newGridData &&
        JSON.stringify(newGridData) !== JSON.stringify(prevState.gridData)
      ) {
        this.saveGuesses(newGridData, true);
      }

      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({
        gridData: newGridData,
      });
      return;
    }

    // Entered when this user types in a new character
    const { gridData } = this.state;
    if (
      gridData &&
      JSON.stringify(gridData) !== JSON.stringify(prevState.gridData)
    ) {
      this.saveGuesses(gridData, false);
      return;
    }

    // Initialization case for first load
    if (data !== prevProps.data) {
      const { size, gridData: newGridData, clues } = createGridData(data);
      this.loadGuesses(newGridData);

      if (newGridData && newGridData !== prevState.gridData) {
        this.saveGuesses(newGridData, false);
      }

      // bulkChange = null;
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({
        size,
        gridData: newGridData,
        clues,

        // focsued: false,

        currentDirection: 'across',
        // Should we start with 1-across highlighted/focused?
        // TODO: track input-field focus so we don't draw highlight when we're
        // not really focused, *and* use first actual clue (whether across or
        // down?)
        focusedRow: 0, // row/col separately, or as a single object?
        focusedCol: 0,
        highlight: '1',

        // bulkChange,
      });
    }

    // handle bulkChange by updating a character at a time (this lets us
    // leverage the existing character-entry logic).
    // if (bulkChange) {
    //   this.handleSingleCharacter(bulkChange[0]);
    //   bulkChange = bulkChange.substring(1);
    //   if (bulkChange.length === 0) {
    //     bulkChange = null;
    //   }
    //   // eslint-disable-next-line react/no-did-update-set-state
    //   this.setState({ bulkChange });
    // }
  }

  clearGuesses() {
    if (!window.localStorage) {
      return;
    }

    window.localStorage.removeItem(this.storageKey);
  }

  // Take the guesses from data, generate the save state, and persist.
  saveGuesses(gridData, isServerUpdate) {
    const { localStorage } = window;
    if (!localStorage) {
      return;
    }

    const guesses = serializeGuesses(gridData);

    const saveData = {
      date: Date.now(),
      guesses,
    };

    // Handle prop callback
    // Only send response to server if it is coming from this client,
    // not another user sending their update
    const { onLetterUpdate } = this.props;
    if (!isServerUpdate && onLetterUpdate) {
      onLetterUpdate(saveData);
      return;
    }

    localStorage.setItem(this.storageKey, JSON.stringify(saveData));
  }

  loadGuesses(gridData) {
    const { data, useStorage, onLoadedCorrect } = this.props;
    let saveData;
    if (!useStorage) {
      const { guessState } = this.props;
      if (!guessState) {
        return;
      }
      saveData = JSON.parse(guessState);
    } else {
      const { localStorage } = window;
      const saveRaw = localStorage.getItem(this.storageKey);
      if (!saveRaw) {
        return;
      }
      saveData = JSON.parse(saveRaw);
    }

    // TODO: check date for expiration?
    deserializeGuesses(gridData, saveData.guesses);

    // check all clues to see what (if any) have been answered
    const loadedCorrect = findCorrectAnswers(data, gridData);

    // console.log('LOADED GUESSES correct:', loadedCorrect);
    if (onLoadedCorrect) {
      onLoadedCorrect(loadedCorrect);
    }
  }

  /**
   * Fills all the answers in the grid and calls the `onLoadedCorrect` callback
   * with _**every**_ answer.
   *
   * @public
   */
  fillAllAnswers() {
    this.setState(
      produce(draft => {
        const { gridData } = draft;
        gridData.forEach((row, r) => {
          row.forEach((cellData, c) => {
            if (cellData.used) {
              cellData.guess = cellData.answer;
            }
          });
        });
      })
    );

    // fake a loadedCorrect for everything...
    const { data, onLoadedCorrect } = this.props;
    const loadedCorrect = [];
    bothDirections.forEach(direction => {
      Object.entries(data[direction]).forEach(([num, info]) => {
        loadedCorrect.push([direction, num, info.answer]);
      });
    });

    if (onLoadedCorrect) {
      onLoadedCorrect(loadedCorrect);
    }
  }

  /**
   * Resets the entire crossword; clearing all answers in the grid and also any
   * persisted data.
   *
   * @public
   */
  reset() {
    this.setState(
      produce(draft => {
        const { gridData } = draft;
        gridData.forEach((row, r) => {
          row.forEach((cellData, c) => {
            if (cellData.used) {
              // eslint-disable-next-line no-param-reassign
              cellData.guess = '';
            }
          });
        });
      })
    );

    this.clearGuesses();
  }

  handleCellClick(cellData) {
    // TODO: if the same cell is clicked, switch directions if possible?
    // for now, we simply prefer across...
    const { focused, focusedRow, focusedCol } = this.state;
    let { currentDirection } = this.state;
    const other = currentDirection === 'across' ? 'down' : 'across';

    // switch directions if we're already focused and the same cell is clicked
    // (and the other direction is available), or if the current direction
    // *isn't* available
    if (
      !cellData[currentDirection] ||
      (focused &&
        cellData.row === focusedRow &&
        cellData.col === focusedCol &&
        cellData[other])
    ) {
      currentDirection = other;
    }

    this.setState({
      // focused: true,
      currentDirection,
      focusedRow: cellData.row,
      focusedCol: cellData.col,
      highlight: cellData[currentDirection],
    });

    this.setFocus();
  }

  handleInputClick(event) {
    // event.preventDefault(); // if we skip this, the input simply gets focus?

    // Clicking on the input field necessarily means a re-click on the focused
    // cell.  Try switching directions...
    const { focused, focusedRow, focusedCol } = this.state;
    let { currentDirection } = this.state;
    const other = currentDirection === 'across' ? 'down' : 'across';

    const cellData = this.getCellData(focusedRow, focusedCol);
    if (focused && cellData[other]) {
      currentDirection = other;
    }

    this.setState({
      focused: true,
      currentDirection,
      highlight: cellData[currentDirection],
    });
  }

  handleClueClick(event) {
    event.preventDefault();
    const { direction, number } = event.target.dataset;
    // console.log('CLUE CLICK', event.target.dataset, direction, number);
    // eslint-disable-next-line react/destructuring-assignment
    const info = this.props.data[direction][number];
    // console.log('data...', data, info);
    this.moveTo(info.row, info.col, direction);
    this.setFocus();
  }

  getCellData(row, col) {
    const { size, gridData } = this.state;
    if (row >= 0 && row < size && col >= 0 && col < size) {
      return gridData[row][col];
    }
    return { row, col, used: false, outOfBounds: true };
  }

  setCellCharacter(row, col, char) {
    // console.log('SETCELLCHARACTER', { row, col, char });
    const { gridData } = this.state;
    const cell = gridData[row][col];

    // If we set a new character, *and* it's correct, *and* the entire answer
    // is correct, fire an "onCorrect" event.
    if (cell.guess === char) {
      // don't need to do anything... no-op
      return;
    }

    // REVIEW: since this is dependent on existing state, should it be a full
    // setState function-style call?  (this.setState(produce(...)) ?)
    this.setState({
      gridData: produce(gridData, draft => {
        draft[row][col].guess = char;
      }),
    });

    if (char === cell.answer) {
      // check the rest of the guess! (both directions, just in case!)
      const { data } = this.props;

      if (cell.across) {
        const info = data.across[cell.across];
        let correct = true;
        for (let i = 0; i < info.answer.length; i++) {
          // skip the current cell, as that state hasn't updated yet?
          // should the check be in componentDidUpdate?
          if (col === info.col + i) {
            // eslint-disable-next-line no-continue
            continue;
          }
          if (gridData[info.row][info.col + i].guess !== info.answer[i]) {
            correct = false;
            break;
          }
        }
        if (correct) {
          this.notifyCorrect('across', cell.across, info.answer);
        }
      }

      if (cell.down) {
        const info = data.down[cell.down];
        let correct = true;
        for (let i = 0; i < info.answer.length; i++) {
          // skip the current cell, as that state hasn't updated yet?
          // should the check be in componentDidUpdate?
          if (row === info.row + i) {
            // eslint-disable-next-line no-continue
            continue;
          }
          if (gridData[info.row + i][info.col].guess !== info.answer[i]) {
            correct = false;
            break;
          }
        }
        if (correct) {
          this.notifyCorrect('down', cell.down, info.answer);
        }
      }
    }
  }

  notifyCorrect(direction, number, answer) {
    const { onCorrect } = this.props;
    // console.log('NOTIFYCORRECT', { direction, number, answer, onCorrect });

    if (!onCorrect) {
      return;
    }

    // Horrible, horrible workaround... we really want to wait to fire the
    // notification *after* the state has been updated (and had a chance to
    // render), but detecting the updated guesses in a deeply nested state
    // property is really difficult.  (Do we interrogate *all* cells to
    // determine which ones have changed?  That's arguably the correct answer.)
    //
    // Even putting the notifications into the state isn't enough, as React
    // will update the state multiple times (to let it settle, presumably)
    // before the actual DOM update and render happens.
    //
    // We want to ensure the listener actually gets this *after* all pending
    // state updates and window renders.  Based on the information at
    // https://stackoverflow.com/a/34999925, we need to delay with a setTimeout
    // *and* a window.requestAnimationFrame...this seems to do the trick.
    setTimeout(() => {
      window.requestAnimationFrame(() => {
        onCorrect(direction, number, answer);
      });
    });
  }

  // We use the keydown event for control/arrow keys, but not for textual
  // input, because it's hard to suss out when a key is "regular" or not.
  handleInputKeyDown(event) {
    // if ctrl, alt, or meta are down, ignore the event (let it bubble)
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    let preventDefault = true;
    const { key } = event;
    // console.log('CROSSWORD KEYDOWN', event.key);

    // FUTURE: should we "jump" over black space?  That might help some for
    // keyboard users.
    switch (key) {
      case 'ArrowUp':
        this.moveRelative(-1, 0);
        break;

      case 'ArrowDown':
        this.moveRelative(1, 0);
        break;

      case 'ArrowLeft':
        this.moveRelative(0, -1);
        break;

      case 'ArrowRight':
        this.moveRelative(0, 1);
        break;

      case ' ': // treat space like tab?
      case 'Tab': {
        const { focusedRow, focusedCol } = this.state;
        let { currentDirection, highlight } = this.state;
        const other = currentDirection === 'across' ? 'down' : 'across';
        const current = this.getCellData(focusedRow, focusedCol);
        if (current[other]) {
          currentDirection = other;
          highlight = current[other];
        }
        this.setState({ currentDirection, highlight });
        break;
      }

      // Backspace: delete the current cell, and move to the previous cell
      // Delete:    delete the current cell, but don't move
      case 'Backspace':
      case 'Delete': {
        const { focusedRow, focusedCol, currentDirection } = this.state;
        this.setCellCharacter(focusedRow, focusedCol, '');
        if (key === 'Backspace') {
          this.moveRelative(
            currentDirection === 'across' ? 0 : -1,
            currentDirection === 'across' ? -1 : 0
          );
        }
        break;
      }

      case 'Home':
      case 'End': {
        // move to beginning/end of this entry?
        const { currentDirection, highlight } = this.state;
        const { data } = this.props;
        const info = data[currentDirection][highlight];
        const { answer } = info;
        let { row, col } = info;
        if (key === 'End') {
          const isAcross = currentDirection === 'across';
          if (isAcross) {
            col += answer.length - 1;
          } else {
            row += answer.length - 1;
          }
        }

        this.moveTo(row, col);
        break;
      }

      default:
        // It would be nice to handle "regular" characters with onInput, but
        // that is still experimental, so we can't count on it.  Instead, we
        // assume that only "length 1" values are regular.
        if (key.length !== 1) {
          preventDefault = false;
          break;
        }

        // key = key.toUpperCase();
        //
        // const { focusedRow, focusedCol } = this.state;
        // this.setCellCharacter(focusedRow, focusedCol, key);
        // this.moveForward();
        this.handleSingleCharacter(key);
        break;
    }

    if (preventDefault) {
      event.preventDefault();
    }
  }

  // this helper is used anywhere we want to deal with typed user-input
  handleSingleCharacter(char) {
    const { focusedRow, focusedCol } = this.state;
    this.setCellCharacter(focusedRow, focusedCol, char.toUpperCase());
    this.moveForward();
  }

  handleInputChange(event) {
    event.preventDefault();
    console.log('INPUT CHANGE!', event.target.value, this);
  }

  /**
   * Sets focus to the crossword such that it will accept keyboard input.  You
   * do not _need_ to call this method, but it's helpful in cases where you want
   * to explicitly give the crossword focus.
   *
   * @public
   */
  setFocus() {
    if (this.inputRef.current) {
      this.inputRef.current.focus();
      this.setState({ focused: true });
    }
  }

  moveForward() {
    // eslint-disable-next-line react/destructuring-assignment
    const isAcross = this.state.currentDirection === 'across';
    this.moveRelative(isAcross ? 0 : 1, isAcross ? 1 : 0);
  }

  moveBackward() {
    // eslint-disable-next-line react/destructuring-assignment
    const isAcross = this.state.currentDirection === 'across';
    this.moveRelative(isAcross ? 0 : -1, isAcross ? -1 : 0);
  }

  // We often need to move one cell in any of the cardinal directions.  This
  // encapsulates that logic.
  moveRelative(dRow, dCol) {
    // *Really*, we should update using a function-based setState arg...TODO?
    const { focusedRow, focusedCol } = this.state;
    const cell = this.moveTo(focusedRow + dRow, focusedCol + dCol);
    if (!cell) {
      return;
    }

    // If we successfully moved, we set the direction (if we can) based on the
    // relative row/col change.
    let { currentDirection, highlight } = this.state;
    if (dRow !== 0 && dCol === 0) {
      currentDirection = 'down';
    } else if (dRow === 0 && dCol !== 0) {
      currentDirection = 'across';
    }

    highlight = cell[currentDirection];

    this.setState({ currentDirection, highlight });
  }

  moveTo(row, col, directionOverride) {
    let { currentDirection, highlight } = this.state;

    if (directionOverride) {
      currentDirection = directionOverride;
    }
    const candidate = this.getCellData(row, col);

    // do nothing if it's not even a valid cell
    if (!candidate.used) {
      return false;
    }

    if (!candidate[currentDirection]) {
      currentDirection = currentDirection === 'across' ? 'down' : 'across';
    }

    highlight = candidate[currentDirection];

    this.setState({
      currentDirection,
      focusedRow: row,
      focusedCol: col,
      highlight,
    });
    return candidate;
  }

  render() {
    const {
      columnBreakpoint,
      gridBackground,
      cellBackground,
      cellBorder,
      textColor,
      numberColor,
      focusBackground,
      highlightBackground,
    } = this.props;

    const {
      size,
      gridData,
      clues,
      focused,
      currentDirection,
      focusedRow,
      focusedCol,
      highlight,
    } = this.state;

    // We have several properties that we bundle together as context for the
    // cells, rather than have them as independent properties.  (Or should they
    // stay separate? Or be passed as "spread" values?)
    const cellSize = 100 / size;
    const cellPadding = 0.125;
    const cellInner = cellSize - cellPadding * 2;
    const cellHalf = cellSize / 2;
    const fontSize = cellInner * 0.7;

    const renderContext = {
      gridBackground,
      cellBackground,
      cellBorder,
      textColor,
      numberColor,
      focusBackground,
      highlightBackground,
      cellSize,
      cellPadding,
      cellInner,
      cellHalf,
      fontSize,
    };

    const clueContext = {
      focused,
      currentDirection,
      highlight,
      highlightBackground,
    };

    const cells = [];
    gridData.forEach((rowData, row) => {
      rowData.forEach((cellData, col) => {
        if (!cellData.used) {
          return;
        }
        cells.push(
          <Cell
            // eslint-disable-next-line react/no-array-index-key
            key={`R${row}C${col}`}
            cellData={cellData}
            renderContext={renderContext}
            focus={focused && row === focusedRow && col === focusedCol}
            highlight={
              focused && highlight && cellData[currentDirection] === highlight
            }
            onClick={this.handleCellClick}
          />
        );
      });
    });

    return (
      <Wrapper columnBreakpoint={columnBreakpoint}>
        <GridWrapper>
          <div style={{ margin: 0, padding: 0, position: 'relative' }}>
            <svg viewBox="0 0 100 100" ref={this.svgRef}>
              <rect
                x={0}
                y={0}
                width={100}
                height={100}
                fill={gridBackground}
              />
              {cells}
            </svg>
            <input
              ref={this.inputRef}
              aria-label="crossword-input"
              type="text"
              onClick={this.handleInputClick}
              onKeyDown={this.handleInputKeyDown}
              onChange={this.handleInputChange}
              value=""
              // onInput={this.handleInput}
              autoComplete="off"
              spellCheck="false"
              autoCorrect="off"
              style={{
                position: 'absolute',
                // In order to ensure the top/left positioning makes sense, there
                // is an absolutely-positioned <div> with no margin/padding that
                // we *don't* expose to consumers.  This keeps the math much more
                // reliable.  (But we're still seeing a slight vertical deviation
                // towards the bottom of the grid!  The "* 0.995" seems to help.)
                top: `calc(${focusedRow * cellSize * 0.995}% + 2px)`,
                left: `calc(${focusedCol * cellSize}% + 2px)`,
                width: `calc(${cellSize}% - 4px)`,
                height: `calc(${cellSize}% - 4px)`,
                fontSize: `${fontSize * 6}px`, // waaay too small...?
                textAlign: 'center',
                textAnchor: 'middle',
                backgroundColor: 'transparent',
                caretColor: 'transparent',
                margin: 0,
                padding: 0,
                border: 0,
                cursor: 'default',
              }}
            />
          </div>
        </GridWrapper>
        <ClueWrapper>
          {bothDirections.map(direction => (
            <div key={direction} className="direction">
              <h3 className="header">{direction.toUpperCase()}</h3>
              {clues[direction].map(({ number, clue }) => (
                <Clue
                  key={number}
                  {...clueContext}
                  clueDirection={direction}
                  number={number}
                  onClick={this.handleClueClick}
                  data-direction={direction}
                  data-number={number}
                  aria-label={`clue-${number}-${direction}`}
                >
                  {number}: {clue}
                </Clue>
              ))}
            </div>
          ))}
        </ClueWrapper>
      </Wrapper>
    );
  }
}

const clueShape = PropTypes.shape({
  clue: PropTypes.string.isRequired,
  answer: PropTypes.string.isRequired,
  row: PropTypes.number.isRequired,
  col: PropTypes.number.isRequired,
});

Crossword.propTypes = {
  /** clue/answer data */
  data: PropTypes.shape({
    across: PropTypes.objectOf(clueShape),
    down: PropTypes.objectOf(clueShape),
  }).isRequired,

  /** browser-width at which the clues go from showing beneath the grid to showing beside the grid */
  columnBreakpoint: PropTypes.string,

  /** overall background color (fill) for the crossword grid; can be `'transparent'` to show through a page background image */
  gridBackground: PropTypes.string,
  /**  background for an answer cell */
  cellBackground: PropTypes.string,
  /** border for an answer cell */
  cellBorder: PropTypes.string,
  /** color for answer text (entered by the player) */
  textColor: PropTypes.string,
  /** color for the across/down numbers in the grid */
  numberColor: PropTypes.string,
  /** background color for the cell with focus, the one that the player is typing into */
  focusBackground: PropTypes.string,
  /** background color for the cells in the answer the player is working on,
   * helps indicate in which direction focus will be moving; also used as a
   * background on the active clue  */
  highlightBackground: PropTypes.string,

  /** whether to use browser storage to persist the player's work-in-progress */
  useStorage: PropTypes.bool,

  /** callback function that fires when a player answers a clue correctly; called with `(direction, number, answer)` arguments, where `direction` is `'across'` or `'down'`, `number` is the clue number as text (like `'1'`), and `answer` is the answer itself */
  onCorrect: PropTypes.func,
  /** callback function that's called when a crossword is loaded, to batch up correct answers loaded from storage; passed an array of the same values that `onCorrect` would recieve */
  onLoadedCorrect: PropTypes.func,

  /** callback function that fires when the user types a letter */
  onLetterUpdate: PropTypes.func,

  /** state representing the current guesses */
  guessState: PropTypes.string,
};

Crossword.defaultProps = {
  columnBreakpoint: '768px',
  gridBackground: 'rgb(0,0,0)',
  cellBackground: 'rgb(255,255,255)',
  cellBorder: 'rgb(0,0,0)',
  textColor: 'rgb(0,0,0)',
  numberColor: 'rgba(0,0,0, 0.25)',
  focusBackground: 'rgb(255,255,0)',
  highlightBackground: 'rgb(255,255,204)',
  useStorage: true,
  onCorrect: null,
  onLoadedCorrect: null,
  onLetterUpdate: null,
  guessState: '',
};

export default Crossword;
