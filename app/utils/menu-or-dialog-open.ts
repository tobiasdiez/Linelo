/** Whether a menu or dialog is open, such as the account menu: keys pressed now belong to it. */
function menuOrDialogOpen(): boolean {
  return document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]') !== null
}

export default menuOrDialogOpen
