# Crew assignment feature

Goal is to enhance the tool to allow maintaining a crew assignment to associate individual persons to a fire truck
and the role they would perform while assigned as crew to that truck.

The implementation should satify the following requirements:

- The list of persons is stored/maintained in the 'data.json' file. This data will be maintained manually in the file, not through the GUI.
- Each person record consists of
  - name (string)
  - roles the person is excluded from (list of role names, empty by default/if not specified)
- For the assignment, the number of persons assigned to a truck, and the roles they are assigned as crew, depends on the category of the truck
- The crew slots per truck category are as follows:
  - A truck of category 'Gruppe' (9 slots) has the following role slots:
    - GF
    - MA
    - ME
    - AF
    - AM
    - WF
    - WM
    - SF
    - SM
  - A truck of category 'Staffel' (6 slots) has the following role slots:
    - SF
    - MA
    - AF
    - AM
    - WF
    - WM
  - A truck of category 'Trupp' (3 slots) has the following role slots:
    - MA
    - MF
    - TM
- A truck can have all of its slots occupied, but not all the slots have to be occupied.
- The assignment of persons to the various slots of all trucks is called a "crew roster"
- Each roster has a name for easy identification
- A roster is based on all available trucks and all available persons, associating every person with one role slot of an available truck.
- A person can not be associated with a role slot if that role is in the person's exclude list.
- The tool can create/edit/delete crew rosters (stored in data.json)
- At any point in time only one crew roster is "active", all others are "inactive"
- The GUI provides an additional RosterManager component (equivalent to the existing alert and truck manager components) to allow managing the rosters in the GUI
- The RosterManager allows (equivalent to the AlertManager) to create, edit, delete roster instances in the GUI
- A RosterDialog allows editing a roster (equivalent to AlertDialog)
- When creating a new roster the user can click a button to randomly assign the the available persons to the slots in the available trucks.
  - The random assignment takes a round-robin approach assigning unassigned person to trucks in rounds.
  - In each assignment round one unassigned person is assigned to each truck still having a free slot.
  - The random assignment runs through rounds until every available person has been assigned to a slot.
- The RosterDialog allows changing the slot assignments via drag and drop
  - When a person is dragged from one slot to another, the old slot is set with the value/person of the new slot (swap)
  - When the new slot is already assigned to a person, then the new slot is associated with the person being dragged and the old slot is associated with the person previously associated with the new slot.
  - When the new slot is empty, then the new slot is associated with the person being dragged and the old slot is set to empty
- The RosterManager set a roster to active, also setting any currently active roster to inactive.
- The TruckCards on the dashboard are enhanced to show the role-person assignments of the currently active roster for that truck (like `<role>: <name>`). '-' is shown as `name` if the slot is empty in the active roster.
- If there is no active roster, then the role-person assignments are shown like `<role>: -` for all slots.
- The backend provides all the necessary endpoints to support the GUI functionality.
