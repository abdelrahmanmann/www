import { connect } from 'react-redux';
import { dismiss } from '../actions/session';
import Palette from '../components/Palette';

const mapDispatchToProps = dispatch => {
  return {
    dismiss: () => dispatch(dismiss()),
    run: (command, state = {}) => command.run(dispatch, state),
  };
};

const PaletteContainer = connect(
  ({ bin, app, user }) => ({ bin, app, user }),
  mapDispatchToProps
)(Palette);

export default PaletteContainer;